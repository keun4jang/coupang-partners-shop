import { supabaseAdmin } from "./supabase";
import {
  CoupangProduct,
  SCOUT_KEYWORDS,
  searchProducts,
  priceText,
  fetchBestCategory,
  fetchGoldbox,
} from "./coupang";
import { dateFolderName } from "./format";
import { appealScore, inferCategory, isSpamTitle, offBrandReason } from "./appeal";
import {
  hasAffiliateEnv,
  loadAffiliateCredsFromSettings,
  searchAffiliateProducts,
} from "./aliexpressAffiliate";

/**
 * 스카우트(시장조사) — 주부가 많이 살 것 같은 카테고리 베스트에서
 * 새 상품 후보를 모아 products 에 candidate 로 등록한다.
 * 승인 게이트 방식: 여기서는 "후보"만 쌓고, 실제 영상 제작은 사람이 승인 후.
 */

export interface ScoutOptions {
  /** 이번 실행에서 새로 등록할 최대 후보 수 */
  maxCandidates?: number;
  /** 키워드당 검색으로 가져올 개수 */
  perKeywordFetch?: number;
  /** 키워드당 한 번에 뽑을 최대 후보 수(다양성 확보) */
  perKeywordTake?: number;
  /** 이번 실행에서 검색할 키워드 수 (기본: 날짜 회전으로 KEYWORDS_PER_RUN 개) */
  keywordsPerRun?: number;
  /** 가격 필터 (원) */
  minPrice?: number;
  maxPrice?: number;
  /** true 면 DB 에 저장하지 않고 수집만 (테스트용) */
  dryRun?: boolean;
}

export interface ScoutCandidate {
  /** 제휴처. 영상 1개 = 상품 1개이고, 그 상품이 쿠팡일 수도 알리일 수도 있다 */
  source?: "coupang" | "aliexpress";
  productId: number;
  product_name: string;
  category: string;
  price_text: string;
  /** 쿠팡=파트너스 링크 / 알리=원본 상품 URL */
  coupang_partner_url: string;
  /** 알리 제휴 링크 (있으면 이쪽이 우선 목적지) */
  affiliate_url?: string | null;
  image_url: string;
  source_memo: string;
}

export interface ScoutResult {
  registered: ScoutCandidate[];
  skippedDuplicate: number;
  skippedFiltered: number;
  /** 키워드 도배 제목이라 아예 후보로 안 받은 수 (필터 조정 근거) */
  skippedSpamTitle: number;
  /** 이번에 새로 담은 알리 후보 수 */
  aliCandidates: number;
  errors: string[];
}

const CPID_RE = /\[cpid:(\d+)\]/;

/**
 * 알리 후보 검색어 (영어). 알리는 국제 플랫폼이라 한국어로 검색하면 안 잡힌다.
 * 배송이 1~2주라 "급하지 않고 신기한" 쪽이 맞아서, 생필품보다 아이디어 상품 위주.
 */
const ALI_KEYWORDS: Array<{ query: string; appCategory: string }> = [
  { query: "kitchen gadget useful", appCategory: "주방템" },
  { query: "home storage organizer", appCategory: "수납템" },
  { query: "cleaning tool household", appCategory: "청소템" },
  { query: "space saving gadget", appCategory: "생활템" },
  { query: "car accessories interior", appCategory: "차량용품" },
];

/** 이미 등록된 상품들의 쿠팡 productId 집합 (source_memo 의 [cpid:...] 마커에서 추출) */
async function loadKnownProductIds(): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("source_memo, coupang_partner_url");
  if (error) throw new Error(`기존 상품 조회 실패: ${error.message}`);
  const ids = new Set<number>();
  for (const row of data ?? []) {
    const m = (row.source_memo as string | null)?.match(CPID_RE);
    if (m) ids.add(Number(m[1]));
  }
  return ids;
}

function passesFilter(
  p: CoupangProduct,
  minPrice: number,
  maxPrice: number
): boolean {
  if (!p.productName || !p.productUrl) return false;
  if (typeof p.productPrice !== "number") return false;
  if (p.productPrice < minPrice || p.productPrice > maxPrice) return false;
  return true;
}

/**
 * 한 번 실행에서 검색할 키워드 개수.
 * Vercel 함수 60초 제한 안에 끝나야 한다 (동시 3개 × 왕복 ~0.4초 기준
 * 70개면 약 10초, 목록형 소스와 DB 저장까지 더해도 여유가 있다).
 */
const KEYWORDS_PER_RUN = 70;

/**
 * 날짜로 회전시켜 오늘 몫의 키워드를 잘라낸다.
 * 매일 시작점이 take 만큼 밀리므로 며칠이면 전체를 한 바퀴 돈다.
 * 같은 날 여러 번 돌면 같은 묶음이 나오는데, 그건 의도한 것이다
 * (하루 안에서는 중복 조회를 늘리지 않는다).
 */
function rotateForToday<T>(items: T[], take: number): T[] {
  if (items.length <= take) return items.slice();
  const day = Math.floor((Date.now() + 9 * 3600_000) / 86400_000);
  const slices = Math.ceil(items.length / take);
  const start = (day % slices) * take;
  const out = items.slice(start, start + take);
  // 마지막 조각이 짧으면 앞에서 채워 매번 같은 개수를 본다
  if (out.length < take) out.push(...items.slice(0, take - out.length));
  return out;
}

/**
 * 카테고리 베스트셀러를 볼 쿠팡 대분류.
 *
 * id 와 실제 카테고리가 어긋나도 안전하다 - 담기 전에 상품명으로 살림템 여부를
 * 다시 판정하므로(offBrandReason) 패션·식품 카테고리가 섞여도 걸러진다.
 * label 은 로그·source_memo 용 표기일 뿐이다.
 */
const BEST_CATEGORY_IDS: Array<{ id: number; label: string }> = [
  { id: 1008, label: "주방용품" },
  { id: 1009, label: "생활용품" },
  { id: 1010, label: "홈인테리어" },
  { id: 1011, label: "가전디지털" },
  { id: 1012, label: "스포츠레저" },
  { id: 1013, label: "자동차용품" },
  { id: 1016, label: "문구오피스" },
];

/** 목록형 소스(골드박스·베스트) 하나당 후보로 담을 최대 개수 */
const LISTING_TAKE = 8;

export async function runScout(opts: ScoutOptions = {}): Promise<ScoutResult> {
  // 한 번에 담을 신규 후보 수. 인스타를 하루 여러 편으로 올리려면 재고가 그만큼
  // 쌓여야 한다 (실측 2026-08-19: 미사용 재고 43개, 8/16 이후 신규 유입 0개).
  // 소스가 키워드 85개 + 골드박스 + 베스트 7종으로 늘어 후보 풀이 넓어졌으므로
  // 등록 상한도 함께 올린다. 품질은 appealScore 정렬이 지켜준다.
  const maxCandidates = opts.maxCandidates ?? 30;
  const perKeywordFetch = opts.perKeywordFetch ?? 10;
  // 키워드당 담는 개수. 상위 2개는 매일 같은 상품이라 대부분 중복으로 걸러진다.
  // 3개까지 담아 라운드로빈이 한 바퀴 더 돌 수 있게 한다(중복 벽 뚫기).
  const perKeywordTake = opts.perKeywordTake ?? 3;
  // 가격 상한을 크게 연다: 목표는 "그 제품 판매"가 아니라 "클릭".
  // 클릭 시 심기는 쿠팡 쿠키로 24시간 내 다른 구매까지 수수료가 붙으므로,
  // 비싼 제품은 오히려 "가격 궁금해서 눌러보는" 클릭 미끼로 좋다.
  // 상한 150만원은 클릭 잘 나올 프리미엄 가젯(고급 로봇청소기·액션캠·드론 등)까지
  // 허용하고, 영상으로 보여주기 애매한 초대형 가전/가구만 거른다.
  // 가격은 선정 기준이 아니다 (사장님 지침: 비싸도 상관없고 필요한 사람은 어차피 산다).
  // 하한 5,000원은 부속품·소모품 낱개 같은 "영상 만들 게 없는" 항목만 걸러내는 용도.
  const minPrice = opts.minPrice ?? 5_000;
  const maxPrice = opts.maxPrice ?? 1_500_000;

  const errors: string[] = [];
  let skippedSpamTitle = 0;
  const known = await loadKnownProductIds();
  const today = dateFolderName();

  // 키워드별로 후보 목록을 만들어 둔다(우선순위 순).
  const buckets: ScoutCandidate[][] = [];

  // 왜 전부 안 돌리나: 이 라우트는 Vercel 함수라 60초 제한이 있는데
  // 키워드 하나에 API 왕복이 붙어 195개를 순서대로 돌면 그것만으로 넘긴다.
  // 그래서 날짜로 회전시켜 하루에 KEYWORDS_PER_RUN 개씩만 검색한다.
  // 며칠이면 전체를 한 바퀴 돌고, 총 키워드 수는 마음껏 늘려도 된다.
  // (검색 API 는 키워드당 10개 고정이라 "키워드 수 = 신규 재고량" 이다)
  const rotated = rotateForToday(SCOUT_KEYWORDS, opts.keywordsPerRun ?? KEYWORDS_PER_RUN);
  console.log(
    `키워드 ${rotated.length}/${SCOUT_KEYWORDS.length}개 검색 (날짜별 회전)`
  );

  const searchWithRetry = async (keyword: string) => {
    try {
      return await searchProducts(keyword, perKeywordFetch);
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
      return await searchProducts(keyword, perKeywordFetch);
    }
  };

  // 순차 호출이면 60초를 넘기므로 소수 동시 실행으로 돈다.
  // 동시 수를 크게 잡으면 쿠팡 호출 제한이 걱정되니 3 정도로 묶는다.
  const CONCURRENCY = 3;
  const keywordResults: Array<{ kw: (typeof SCOUT_KEYWORDS)[number]; products: CoupangProduct[] }> = [];
  for (let i = 0; i < rotated.length; i += CONCURRENCY) {
    const chunk = rotated.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (kw) => {
        try {
          const products = await searchWithRetry(kw.keyword);
          keywordResults.push({ kw, products });
        } catch (e) {
          errors.push(`${kw.keyword}: ${(e as Error).message}`);
        }
      })
    );
  }

  for (const { kw, products } of keywordResults) {
    try {
      // 검색 결과를 "혹하는 정도" 순으로 세워 두고 앞에서부터 담는다.
      // (쿠팡 기본 정렬은 판매량 위주라, 잘 팔려도 영상으로 보여줄 게 없는
      //  소모품이 앞에 오는 경우가 많다)
      const ranked = [...products].sort(
        (a, b) => appealScore(b.productName ?? "") - appealScore(a.productName ?? "")
      );
      const bucket: ScoutCandidate[] = [];
      for (const p of ranked) {
        if (!passesFilter(p, minPrice, maxPrice)) continue;
        // 검색 노출용으로 키워드를 도배한 제목은 아예 후보로 받지 않는다
        // (카드에 쓸 짧은 이름도, 대본 근거도 안 나온다)
        if (isSpamTitle(p.productName)) {
          skippedSpamTitle++;
          continue;
        }
        bucket.push({
          productId: p.productId,
          product_name: p.productName.trim(),
          category: kw.appCategory,
          price_text: priceText(p.productPrice),
          coupang_partner_url: p.productUrl,
          image_url: p.productImage ?? "",
          source_memo: `스카우트 · '${kw.keyword}' 검색 · [cpid:${p.productId}] · ${today}`,
        });
        if (bucket.length >= perKeywordTake) break;
      }
      buckets.push(bucket);
    } catch (e) {
      errors.push(`${kw.keyword}: ${(e as Error).message}`);
      buckets.push([]);
    }
  }

  // ── 추가 소스: 골드박스 · 카테고리 베스트셀러 ─────────────────────────
  //
  // 키워드 검색만으로는 재고가 안 는다. 검색 API 는 키워드당 최대 10개에
  // 페이지 넘기기가 없어서 매일 같은 상위 10개를 돌려주고, 그게 전부 이미
  // 등록된 상품이라 신규가 0인 날이 이어졌다(실측: 8/16 이후 3일간 0개).
  //
  // 그래서 그동안 쓰지 않던 두 소스를 붙인다:
  //  · 골드박스: 쿠팡이 매일 바꾸는 특가 목록 → 날마다 새 상품이 들어온다
  //  · 카테고리 베스트셀러: 카테고리별 상위 목록 → 검색으로는 안 닿던 풀
  //
  // 두 소스는 "우리가 검색어를 고르는" 게 아니라 쿠팡이 주는 대로 오므로
  // 패션·식품 같은 살림템 아닌 품목이 섞인다. offBrandReason 으로 걷어내고,
  // 카테고리는 상품명으로 판정한다(카테고리가 배경 스톡 검색어를 좌우한다).
  let skippedOffBrand = 0;
  const fromListing = (products: CoupangProduct[], memo: string): ScoutCandidate[] => {
    const out: ScoutCandidate[] = [];
    for (const p of products) {
      if (!passesFilter(p, minPrice, maxPrice)) continue;
      if (isSpamTitle(p.productName)) {
        skippedSpamTitle++;
        continue;
      }
      if (offBrandReason(p.productName)) {
        skippedOffBrand++;
        continue;
      }
      out.push({
        productId: p.productId,
        product_name: p.productName.trim(),
        category: inferCategory(p.productName),
        price_text: priceText(p.productPrice),
        coupang_partner_url: p.productUrl,
        image_url: p.productImage ?? "",
        source_memo: `스카우트 · ${memo} · [cpid:${p.productId}] · ${today}`,
      });
    }
    // 혹하는 순으로 세워 두면 라운드로빈이 좋은 것부터 집어간다
    return out.sort((a, b) => appealScore(b.product_name) - appealScore(a.product_name));
  };

  try {
    const goldbox = await fetchGoldbox();
    const bucket = fromListing(goldbox, "골드박스");
    if (bucket.length) buckets.push(bucket.slice(0, LISTING_TAKE));
  } catch (e) {
    errors.push(`골드박스: ${(e as Error).message}`);
  }

  for (const cat of BEST_CATEGORY_IDS) {
    try {
      await new Promise((r) => setTimeout(r, 120));
      const best = await fetchBestCategory(cat.id, 50);
      const bucket = fromListing(best, `베스트 ${cat.label}`);
      if (bucket.length) buckets.push(bucket.slice(0, LISTING_TAKE));
    } catch (e) {
      errors.push(`베스트 ${cat.label}: ${(e as Error).message}`);
    }
  }

  // 라운드로빈으로 카테고리를 번갈아 뽑아 다양성 확보 + 중복 제거.
  const registered: ScoutCandidate[] = [];
  const pickedIds = new Set<number>();
  let skippedDuplicate = 0;
  let skippedFiltered = 0;
  let round = 0;
  let progressed = true;
  while (registered.length < maxCandidates && progressed) {
    progressed = false;
    for (const bucket of buckets) {
      if (round >= bucket.length) continue;
      progressed = true;
      const c = bucket[round];
      if (known.has(c.productId) || pickedIds.has(c.productId)) {
        skippedDuplicate++;
        continue;
      }
      pickedIds.add(c.productId);
      registered.push(c);
      if (registered.length >= maxCandidates) break;
    }
    round++;
  }
  // 뽑히지 않은(중복도 아닌) 나머지는 필터 통과했지만 이번엔 제외된 것
  skippedFiltered = buckets.reduce((s, b) => s + b.length, 0) - registered.length - skippedDuplicate;
  if (skippedFiltered < 0) skippedFiltered = 0;

  // 알리 후보 - 어필리에이트 승인 전에는 건너뛴다.
  // 승인 전에 담아봤자 수수료가 안 붙는 링크로 영상이 나가는데, 영상은 지울 수
  // 없으니 그 한 편은 영영 돈이 안 되는 콘텐츠가 된다.
  let aliCandidates = 0;
  await loadAffiliateCredsFromSettings();
  if (hasAffiliateEnv()) {
    const aliTake = Math.max(1, Math.floor(maxCandidates / 3)); // 대략 1/3 을 알리로
    for (const kw of ALI_KEYWORDS.slice(0, aliTake)) {
      try {
        const found = await searchAffiliateProducts(kw.query, 10);
        const pick = found
          .filter((p) => p.title && p.imageUrl && !isSpamTitle(p.title))
          .sort((a, b) => appealScore(b.title) - appealScore(a.title))[0];
        if (!pick) continue;
        const pid = Number(pick.productId);
        if (!Number.isFinite(pid) || known.has(pid) || pickedIds.has(pid)) continue;
        pickedIds.add(pid);
        registered.push({
          source: "aliexpress",
          productId: pid,
          product_name: pick.title.trim(),
          category: kw.appCategory,
          price_text: pick.price ? `${pick.price}원` : "",
          // 원본은 coupang_partner_url(범용 상품 URL) 자리에, 제휴 링크는 affiliate_url 에.
          // 목적지는 productTargetUrl() 이 affiliate_url 우선으로 고른다.
          coupang_partner_url: `https://www.aliexpress.com/item/${pick.productId}.html`,
          affiliate_url: pick.promotionLink,
          image_url: pick.imageUrl,
          source_memo: `알리 스카우트 · '${kw.query}' · [cpid:${pid}] · 수수료 ${pick.commissionRate || "?"}% · ${today}`,
        });
        aliCandidates++;
      } catch (e) {
        errors.push(`알리 '${kw.query}': ${(e as Error).message.slice(0, 80)}`);
      }
    }
  }

  if (registered.length > 0 && !opts.dryRun) {
    const rows = registered.map((c) => ({
      source: c.source ?? "coupang",
      affiliate_url: c.affiliate_url ?? null,
      product_name: c.product_name,
      category: c.category,
      price_text: c.price_text,
      coupang_partner_url: c.coupang_partner_url,
      image_url: c.image_url || null,
      source_memo: c.source_memo,
      status: "candidate" as const,
    }));
    const { error } = await supabaseAdmin().from("products").insert(rows);
    if (error) throw new Error(`후보 저장 실패: ${error.message}`);
  }

  if (skippedSpamTitle > 0) {
    console.log(`스팸성 제목 ${skippedSpamTitle}건 수집 제외`);
  }
  if (skippedOffBrand > 0) {
    // 골드박스·베스트셀러에 섞여 온 패션·식품류. 많이 찍히는 게 정상이다
    // (그만큼 목록형 소스가 넓다는 뜻). 이 수가 0 이면 필터가 안 도는 것이니 의심.
    console.log(`살림템 아님 ${skippedOffBrand}건 수집 제외 (골드박스·베스트)`);
  }

  return {
    registered,
    skippedDuplicate,
    skippedFiltered,
    skippedSpamTitle,
    aliCandidates,
    errors,
  };
}

/** 텔레그램 요약 메시지 */
export function formatScoutMessage(result: ScoutResult): string {
  // 후보 수집 결과는 알림에 넣지 않는다(사장님 요청 - 전부 자동으로 골라 만들어짐).
  // 오류가 있을 때만 알려서 조치할 수 있게 한다.
  if (!result.errors.length) return "";
  // 키워드가 85개라 공통 원인(키 미설정 등)이면 오류도 85줄이 된다.
  // 텔레그램 상한은 4096자라 그대로 보내면 400 으로 통째로 전송 실패한다
  // (실측 2026-08-19: "message is too long" 으로 알림이 아예 안 갔다).
  // 같은 문구는 묶고, 남는 건 건수로만 알린다.
  const byMessage = new Map<string, string[]>();
  for (const line of result.errors) {
    const idx = line.indexOf(": ");
    const keyword = idx > 0 ? line.slice(0, idx) : "?";
    const message = idx > 0 ? line.slice(idx + 2) : line;
    const list = byMessage.get(message) ?? [];
    list.push(keyword);
    byMessage.set(message, list);
  }
  const parts: string[] = [];
  for (const [message, keywords] of [...byMessage.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    const shown = keywords.slice(0, 3).join(", ");
    const more = keywords.length > 3 ? ` 외 ${keywords.length - 3}개` : "";
    parts.push(`· (${keywords.length}건) ${shown}${more}\n  ${message.slice(0, 200)}`);
  }
  const body = parts.slice(0, 6).join("\n");
  const omitted = parts.length > 6 ? `\n… 그 외 ${parts.length - 6}종 오류 생략` : "";
  return `⚠️ 스카우트 일부 오류 (총 ${result.errors.length}건):\n${body}${omitted}`.slice(
    0,
    3800
  );
}

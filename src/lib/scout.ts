import { supabaseAdmin } from "./supabase";
import {
  CoupangProduct,
  SCOUT_KEYWORDS,
  searchProducts,
  priceText,
} from "./coupang";
import { dateFolderName } from "./format";
import { appealScore, isSpamTitle } from "./appeal";
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

export async function runScout(opts: ScoutOptions = {}): Promise<ScoutResult> {
  const maxCandidates = opts.maxCandidates ?? 8;
  const perKeywordFetch = opts.perKeywordFetch ?? 10;
  const perKeywordTake = opts.perKeywordTake ?? 2;
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
  for (const kw of SCOUT_KEYWORDS) {
    try {
      const products = await searchProducts(kw.keyword, perKeywordFetch);
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
  return result.errors.length ? `⚠️ 스카우트 일부 오류:\n${result.errors.join("\n")}` : "";
}

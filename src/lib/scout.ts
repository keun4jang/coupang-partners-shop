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
import { getSetting, setSetting } from "./settings";
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
  /**
   * 수집을 끊을 시각(Date.now() 기준 ms). 넘으면 남은 검색을 포기하고
   * 지금까지 모은 것으로 마무리한다. Vercel 함수 60초 제한 때문에 필요하다 -
   * 수집이 시간을 다 먹으면 호출부의 영상 큐잉이 통째로 날아간다(실측 8/20:
   * 6편 목표에 3편만 큐잉됨).
   */
  deadlineAt?: number;
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
  /** 소스별 집계 (진단용) - 받아온 수 / 후보로 담은 수 / 최종 등록 수 */
  sourceStats: Record<string, { fetched: number; kept: number; registered: number }>;
  /** 이번에 새로 담은 알리 후보 수 */
  aliCandidates: number;
  errors: string[];
  /** 호출 한도에 걸려 건너뛴 경우, 그 자리에서 아무 API 호출도 하지 않았음을 표시 */
  blockedSkip?: boolean;
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
  // PostgREST 는 limit 미지정 시 1000행에서 조용히 자른다. 상품이 1000개를 넘으면
  // 그 뒤 행이 "모르는 상품"이 돼 이미 등록한 상품을 매일 다시 담게 된다
  // (중복 insert 는 unique 제약에 걸려 후보 저장 전체가 실패한다). 페이지로 다 읽는다.
  const db = supabaseAdmin();
  const ids = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("products")
      .select("source_memo")
      .range(from, from + 999);
    if (error) throw new Error(`기존 상품 조회 실패: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const m = (row.source_memo as string | null)?.match(CPID_RE);
      if (m) ids.add(Number(m[1]));
    }
    if (rows.length < 1000) break;
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
 *
 * 쿠팡 검색 API "시간당 사용 횟수" 한도 때문에 70 → 45 로 줄였다
 * (2026-08-28 전체 점검). 실측: 70키워드 + 골드박스 1 + 베스트 6 = 77회
 * 호출이, 완주된 두 번 모두 정확히 76번째 호출에서 위반으로 등록됐다
 * (GH Actions 로그 2건 재구성 - 시간당 한도 약 75회 추정). 403 을 받은
 * 시점엔 이미 위반이 기록된 뒤라, 예방은 실행당 호출량을 한도 아래로
 * 줄이는 것뿐이다. 45 + 7 = 52회면 재시도 여유까지 포함해도 한도 아래.
 * 같은 이유로 60분 안의 재실행도 runScout 입구에서 막는다
 * (last_scout_sweep_at). Vercel 60초 제한에도 여유가 더 생긴다.
 * (같은 날은 같은 묶음을 검색하므로(rotateForToday) 하루 1조각,
 *  195개 키워드는 닷새면 한 바퀴 돈다)
 */
const KEYWORDS_PER_RUN = 45;

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
  // 1009(생활용품)는 쿠팡 쪽에서 비활성화됨 (rCode=400 "category id is not
  // active", 실측 2026-08-26) - 매번 오류만 나서 뺐다.
  { id: 1010, label: "홈인테리어" },
  { id: 1011, label: "가전디지털" },
  { id: 1012, label: "스포츠레저" },
  { id: 1013, label: "자동차용품" },
  { id: 1016, label: "문구오피스" },
];

/** 목록형 소스(골드박스·베스트) 하나당 후보로 담을 최대 개수 */
const LISTING_TAKE = 8;

export async function runScout(opts: ScoutOptions = {}): Promise<ScoutResult> {
  // 호출 한도(rCode=403)에 걸리면 재시도 가능 시각을 app_settings 에 남겨두고,
  // 그 시각이 지나기 전까지는 API 를 아예 건드리지 않는다.
  // (2026-08-28 전체 점검 실측 정정: 차단 중의 403 재호출은 위반 횟수를
  //  올리지 않는 것으로 확인됐다 - 약 300회를 두드려도 카운터가 1회 그대로였다.
  //  그래도 헛호출 없이 조용히 쉬는 게 안전하고 로그도 깨끗해 가드는 유지한다.)
  // 총 3회 초과되면 파트너스 이용 자체가 제한된다. 큐잉(queue-runner)은
  // 이 함수와 별도로 돌아 영상 발행에는 영향이 없다.
  const blockedUntil = await getSetting("coupang_search_blocked_until");
  if (blockedUntil && new Date(blockedUntil).getTime() > Date.now()) {
    const msg = `쿠팡 검색 API 호출 한도 초과로 대기 중 - 재개 예정 ${blockedUntil}`;
    console.log(msg);
    return {
      registered: [],
      skippedDuplicate: 0,
      skippedFiltered: 0,
      skippedSpamTitle: 0,
      sourceStats: {},
      aliCandidates: 0,
      errors: [msg],
      blockedSkip: true,
    };
  }

  // 60분 안에 이미 스윕이 돌았다면 이번 실행은 통째로 건너뛴다.
  // GH 스케줄 지연(1~4시간 실측)으로 두 실행(GH 2회 + Vercel 1회)이 같은
  // 1시간에 겹치면, 실행당 호출량을 줄여도 합산(52+52=104회)으로 시간당
  // 한도(약 75회)를 넘는다. 실제로 1차 위반이 "19분 간격 두 실행"에서 났다.
  const lastSweepAt = await getSetting("last_scout_sweep_at");
  if (lastSweepAt && Date.now() - new Date(lastSweepAt).getTime() < 60 * 60_000) {
    const msg = `직전 스카우트(${lastSweepAt})가 60분 이내라 이번 실행은 건너뜀 (시간당 한도 보호)`;
    console.log(msg);
    return {
      registered: [],
      skippedDuplicate: 0,
      skippedFiltered: 0,
      skippedSpamTitle: 0,
      sourceStats: {},
      aliCandidates: 0,
      errors: [msg],
      blockedSkip: true,
    };
  }

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

  // 남은 시간이 없으면 수집을 멈춘다(호출부의 후속 작업 시간을 남겨 둔다)
  const deadlineAt = opts.deadlineAt ?? Number.POSITIVE_INFINITY;
  const outOfTime = () => Date.now() >= deadlineAt;

  const errors: string[] = [];
  let skippedSpamTitle = 0;
  // 소스별 집계. Vercel 함수 로그를 볼 수 없어서(호스팅 특성) 어느 소스가
  // 몇 건을 물어왔는지 DB 에 남긴다 - 이게 없으면 "0건"의 원인을 못 좁힌다.
  const sourceStats: Record<string, { fetched: number; kept: number; registered: number }> = {};
  const bump = (src: string, field: "fetched" | "kept" | "registered", n = 1) => {
    sourceStats[src] = sourceStats[src] ?? { fetched: 0, kept: 0, registered: 0 };
    sourceStats[src][field] += n;
  };
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

  // 스윕 시작을 먼저 기록한다 - 도중에 죽어도 60분 잠금이 걸리게.
  // (기록 실패가 수집을 막지는 않는다)
  try {
    await setSetting("last_scout_sweep_at", new Date().toISOString());
  } catch {
    // 무시
  }

  // 시간당 호출 한도(rCode=403)에 걸리면 그 즉시 멈춘다. 2026-08-28 전체
  // 점검 실측으로 확인된 위반 메커니즘: 위반은 "새 시간 창에서 한도(약 75회)를
  // 처음 넘는 그 호출"에서 등록된다(완주된 두 스윕 모두 76번째 호출에서 위반).
  // 즉 403 을 받은 시점엔 이미 위반이 기록된 뒤라, 여기서 멈추는 건 피해 확산
  // 방지일 뿐이고 진짜 예방은 KEYWORDS_PER_RUN 축소 + 60분 잠금이다.
  // 총 3회 초과되면 파트너스 이용 자체가 제한된다.
  // rCode=403(쿠팡의 정상 한도 응답) 외에, 쿠팡이 응답 형태를 바꾸는 경우
  // (HTTP 403/429 직접 반환, 비-JSON 오류 페이지)도 한도로 간주한다 -
  // 미탐하면 재시도가 호출 수를 두 배로 불리고 차단 시각도 저장이 안 된다.
  const isRateLimitError = (e: unknown): boolean => {
    const m = (e as Error)?.message ?? "";
    return (
      m.includes("rCode=403") ||
      m.includes("시간당 사용 횟수") ||
      /\((403|429)[,)]/.test(m)
    );
  };

  // 일시 오류 재시도는 실행 전체에서 소수만 허용한다 - 쿠팡 쪽 장애로 대량
  // 실패하는 날 재시도가 호출 수를 두 배로 불려 한도를 넘기는 걸 막는다.
  let retriesUsed = 0;
  const MAX_RETRIES_PER_RUN = 10;
  const searchWithRetry = async (keyword: string) => {
    try {
      return await searchProducts(keyword, perKeywordFetch);
    } catch (e) {
      if (isRateLimitError(e)) throw e; // 한도 초과는 재시도하지 않는다(더 두드릴수록 손해)
      if (retriesUsed >= MAX_RETRIES_PER_RUN) throw e;
      retriesUsed++;
      await new Promise((r) => setTimeout(r, 1200));
      return await searchProducts(keyword, perKeywordFetch);
    }
  };

  // 순차 호출이면 60초를 넘기므로 소수 동시 실행으로 돈다.
  // 동시 수를 크게 잡으면 쿠팡 호출 제한이 걱정되니 3 정도로 묶는다.
  const CONCURRENCY = 3;
  const keywordResults: Array<{ kw: (typeof SCOUT_KEYWORDS)[number]; products: CoupangProduct[] }> = [];
  let searchedCount = 0;
  let rateLimited = false;
  for (let i = 0; i < rotated.length; i += CONCURRENCY) {
    if (outOfTime()) {
      console.log(`시간 예산 초과 - 키워드 ${searchedCount}/${rotated.length}개에서 중단`);
      break;
    }
    if (rateLimited) {
      console.log(`쿠팡 호출 한도 초과 - 남은 키워드 ${rotated.length - searchedCount}개 건너뜀`);
      errors.push(`(호출 한도로 건너뜀) 나머지 ${rotated.length - searchedCount}개 키워드`);
      break;
    }
    const chunk = rotated.slice(i, i + CONCURRENCY);
    searchedCount += chunk.length;
    await Promise.all(
      chunk.map(async (kw) => {
        try {
          const products = await searchWithRetry(kw.keyword);
          keywordResults.push({ kw, products });
        } catch (e) {
          if (isRateLimitError(e)) rateLimited = true;
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
      bump("키워드검색", "fetched", products.length);
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
      bump("키워드검색", "kept", bucket.length);
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
    bump(memo, "fetched", products.length);
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
    bump(memo, "kept", out.length);
    // 이미 등록된 상품을 먼저 걷어낸다.
    //
    // 왜 여기서 거르나: 아래 호출부가 상위 LISTING_TAKE 개만 잘라 쓰는데, 베스트셀러는
    // 순위가 며칠씩 그대로라 "상위 8개"가 매일 같은 상품이다. 중복 제거를 라운드로빈
    // 단계에만 맡기면 그 8개가 전부 known 이라 첫날 이후 구조적으로 0건이 된다
    // (실측 2026-08-20: 골드박스·베스트 7종 합계 신규 0건).
    const fresh = out.filter((c) => !known.has(c.productId));
    // 혹하는 순으로 세워 두면 라운드로빈이 좋은 것부터 집어간다
    return fresh.sort((a, b) => appealScore(b.product_name) - appealScore(a.product_name));
  };

  // 목록형 버킷은 배열 앞쪽에 넣는다. 라운드로빈이 buckets 를 앞에서부터 훑기 때문에,
  // 뒤에 두면 키워드 버킷 70개가 먼저 자리를 채운다. 골드박스는 매일 바뀌는 소스라
  // 신규 확보 확률이 가장 높으므로 우선권을 준다.
  const listingBuckets: ScoutCandidate[][] = [];
  if (rateLimited) {
    errors.push("(호출 한도로 건너뜀) 골드박스 · 카테고리 베스트셀러 전체");
  } else {
    try {
      if (outOfTime()) throw new Error("시간 예산 초과로 건너뜀");
      const goldbox = await fetchGoldbox();
      const bucket = fromListing(goldbox, "골드박스");
      if (bucket.length) listingBuckets.push(bucket.slice(0, LISTING_TAKE));
    } catch (e) {
      if (isRateLimitError(e)) rateLimited = true;
      errors.push(`골드박스: ${(e as Error).message}`);
    }

    for (const cat of BEST_CATEGORY_IDS) {
      if (rateLimited) {
        errors.push(`(호출 한도로 건너뜀) 베스트 ${cat.label}`);
        continue;
      }
      try {
        if (outOfTime()) throw new Error("시간 예산 초과로 건너뜀");
        await new Promise((r) => setTimeout(r, 120));
        const best = await fetchBestCategory(cat.id, 50);
        const bucket = fromListing(best, `베스트 ${cat.label}`);
        if (bucket.length) listingBuckets.push(bucket.slice(0, LISTING_TAKE));
      } catch (e) {
        if (isRateLimitError(e)) rateLimited = true;
        errors.push(`베스트 ${cat.label}: ${(e as Error).message}`);
      }
    }
  }

  // 이번 실행에서 새로 한도에 걸렸다면, 오류 메시지에 박혀 있는 재시도 가능
  // 시각을 뽑아 다음 실행이 미리 건너뛸 수 있게 저장해둔다. 시각을 못 뽑으면
  // (메시지 형식 변경 등) now+24h 로 보수적으로 잡는다 - 저장을 안 하면 다음
  // 실행이 가드 없이 또 전체 스윕을 돌아 위반이 쌓인다.
  if (rateLimited) {
    const retryAt =
      errors
        .map((e) => e.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+)/)?.[1])
        .find((m): m is string => Boolean(m)) ??
      new Date(Date.now() + 24 * 3600_000).toISOString();
    try {
      await setSetting("coupang_search_blocked_until", retryAt);
      console.log(`쿠팡 호출 한도 - 다음 재개 예정: ${retryAt}`);
    } catch {
      // 저장 실패해도 이번 실행 자체는 계속 진행한다
    }
  }

  buckets.unshift(...listingBuckets);

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

  // 등록된 것들을 소스별로 되짚어 집계 (source_memo 에 소스 이름이 들어 있다)
  for (const c of registered) {
    const memo = c.source_memo ?? "";
    const src = memo.includes("골드박스")
      ? "골드박스"
      : memo.includes("베스트")
        ? memo.slice(memo.indexOf("베스트"), memo.indexOf(" · [cpid"))
        : memo.includes("알리")
          ? "알리"
          : "키워드검색";
    bump(src, "registered");
  }

  // 진단 기록: 이번 실행이 어디서 몇 건을 물어왔는지 DB 에 남긴다.
  // (Vercel 함수 로그를 볼 수 없어서 이게 유일한 사후 확인 수단이다)
  try {
    await setSetting(
      "last_scout_result",
      JSON.stringify({
        at: new Date().toISOString(),
        registered: registered.length,
        keywordsSearched: searchedCount,
        keywordsPlanned: rotated.length,
        skippedDuplicate,
        skippedSpamTitle,
        skippedOffBrand,
        sourceStats,
        errors: errors.slice(0, 8),
        errorCount: errors.length,
      }).slice(0, 4000)
    );
  } catch {
    // 진단 기록 실패가 스카우트를 막지는 않는다
  }

  return {
    registered,
    skippedDuplicate,
    skippedFiltered,
    skippedSpamTitle,
    sourceStats,
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

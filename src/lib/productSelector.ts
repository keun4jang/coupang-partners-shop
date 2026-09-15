import type { Product } from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { appealScore, spamTitleReason } from "./appeal";

/**
 * video_items 의 product_id 전량 조회.
 * PostgREST 는 limit 미지정 시 1000행에서 조용히 자른다. 영상이 1000개를 넘으면
 * "아직 영상 없는 상품" 판정이 그 뒤 행을 못 보고 깨지므로 페이지로 다 읽는다.
 */
async function allVideoProductIds(): Promise<string[]> {
  const db = supabaseAdmin();
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("video_items")
      .select("product_id")
      // 실패한 영상은 "이 상품은 썼다"로 치지 않는다.
      //
      // 렌더가 실패하면 그 항목은 failed 로 남는데, 워커는 pending/rendered 만
      // 집어가므로 자동 재시도가 없다. 그런데 여기서 상품까지 사용됨으로 세면
      // 영상은 한 편도 안 나갔는데 상품 하나가 영구히 재고에서 빠진다
      // (재고가 30개대인 지금은 실패 1건 = 하루 발행의 1/6 손실).
      // 제외하면 다음 큐잉에서 같은 상품으로 다시 시도된다.
      .neq("video_status", "failed")
      .range(from, from + 999);
    if (error) throw new Error(`영상 수 조회 실패: ${error.message}`);
    const rows = (data ?? []) as { product_id: string }[];
    out.push(...rows.map((r) => r.product_id));
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * 숏폼에 우선 배정할 카테고리.
 * 클릭 실적(노출일당 클릭) 기준 - 생활템·수납템이 가장 잘 나오고
 * 육아생활템이 가장 낮아 아래 DEPRIORITIZED_CATEGORIES 로 뺐다.
 */
const PREFERRED_CATEGORIES = [
  "생활템",
  "청소템",
  "수납템",
  "주방템",
  "차량용품",
  "캠핑",
  "자취템",
];

/**
 * 비중을 줄일 카테고리 (감점).
 * 완전히 배제하지는 않는다 - 다른 후보가 떨어졌을 때는 여전히 쓰인다.
 */
const DEPRIORITIZED_CATEGORIES = ["육아생활템"];

/**
 * KST 기준 일련일 (자정이 지나면 1 증가). 카테고리 회전 오프셋으로 쓴다.
 * 날짜에서만 결정되므로 같은 날 여러 번 호출해도 순서가 흔들리지 않는다.
 */
export function kstDayIndex(now: Date = new Date()): number {
  return Math.floor((now.getTime() + 9 * 3600_000) / 86400_000);
}

/** price_text("37,570원") → 숫자. 못 읽으면 null */
export function parsePriceWon(priceText?: string | null): number | null {
  if (!priceText) return null;
  const digits = String(priceText).replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 스팸성 제목(검색 노출용 키워드 도배) 상품을 후보에서 뺀다.
 * 스카우트 단계에서도 막지만, 그 필터가 생기기 전에 쌓인 후보가 DB 에 남아 있어
 * 선정 시점에도 한 번 더 거른다. 무엇이 왜 빠졌는지는 로그로 남긴다.
 */
function dropSpamTitles(products: Product[]): Product[] {
  const kept: Product[] = [];
  for (const p of products) {
    const reason = spamTitleReason(p.product_name);
    if (reason) {
      console.log(`제외(스팸성 제목 · ${reason}): ${p.product_name.slice(0, 60)}`);
      continue;
    }
    kept.push(p);
  }
  // 전부 걸러졌다면 필터가 과했다는 뜻이므로 원본을 그대로 쓴다 (발행이 멈추면 안 된다)
  if (kept.length === 0 && products.length > 0) {
    console.warn("후보가 전부 스팸성 제목으로 걸러져 필터를 건너뜁니다");
    return products.slice();
  }
  return kept;
}

/**
 * 선정 시점 대표 사진 검사.
 *
 * 스카우트(scout.ts)는 이제 새로 담는 상품의 대표 사진을 비전으로 본다. 그런데
 * 그 게이트가 생기기 전에 쌓인 재고가 1,300개쯤 있고, 그중 1~3%는 사진에
 * 중국어가 박혀 있거나 정작 제품이 안 보이는 것들이다(247번 영상이 그 사례).
 * 게이트가 신규 유입에만 걸려 있으면 그 재고에서 뽑힌 상품은 아무도 못 막는다.
 *
 * 재고 전체를 한 번에 훑는 방법(scripts/product-image-audit.ts)도 있지만
 * 1,300건이면 무료 등급 일일 한도를 넘긴다 - 실제로 2026-09-15 전체 실행은
 * 한도가 말라 1,100건이 조용히 "통과"로 찍혔다. 그래서 여기서 "쓰기 직전인
 * 상품만" 검사한다. 하루 4편이면 검사도 하루 대여섯 건이라 한도 걱정이 없고,
 * 재고는 어차피 쓰이는 순간 전수 검사된다.
 *
 * 세 가지 원칙:
 *  - 검사 불가(키 없음·네트워크·한도)는 통과로 친다. 품질 게이트지 안전장치가
 *    아니다 - 검사 장치가 죽었다고 그날 발행이 멈추면 손해가 더 크다.
 *  - 시간·횟수 예산을 넘으면 남은 자리는 검사 없이 채운다 (같은 이유).
 *  - 부적합 상품은 paused 로 내려 다음부터 후보에서 빠지게 한다 (삭제 아님).
 */
const DEFAULT_IMAGE_CHECK_BUDGET_MS = 15_000;

/** 한 번 선정에서 허용할 최대 검사 횟수 (필요 편수 대비 여유) */
function maxImageChecks(count: number): number {
  return count * 3 + 3;
}

async function pauseBadImageProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin()
    .from("products")
    .update({ status: "paused" })
    .in("id", ids);
  // 상태 변경 실패는 발행을 막을 이유가 못 된다 (다음 선정에서 다시 걸린다)
  if (error) {
    console.warn(`대표 사진 부적합 상품 paused 실패(계속 진행): ${error.message.slice(0, 120)}`);
  }
}

/** 검사 한 건의 결과: 통과 / 부적합(사유) / 검사 불가(null) */
type ImageCheckFn = (
  product: Product
) => Promise<{ ok: boolean; reason: string } | null>;

/**
 * 후보를 앞에서부터 훑으며 사진 검사를 통과한 상품만 count 개 고른다.
 * ordered 는 이미 우선순위대로 정렬돼 있어야 한다.
 *
 * 검사 함수와 시계를 인자로 받는 이유는 이 걷는 규칙(예산 소진 시 통과 처리,
 * 검사 불가 시 통과 처리, 사진 없는 상품 건너뛰기)이 진짜 위험한 부분이라
 * API·DB 없이 시험할 수 있어야 하기 때문이다(scripts/selector-selftest.ts).
 * 2026-09-15 전체 진단이 한도 소진으로 1,100건을 조용히 "통과"시켰던 것처럼,
 * 이런 통과 처리는 겉으로 티가 안 난다.
 */
export async function takeFirstPassing(
  ordered: Product[],
  count: number,
  opts: {
    check: ImageCheckFn;
    deadlineAt: number;
    maxChecks: number;
    now?: () => number;
  }
): Promise<{ picked: Product[]; rejected: Product[]; checks: number }> {
  const now = opts.now ?? Date.now;
  const picked: Product[] = [];
  const rejected: Product[] = [];
  let checks = 0;
  let overBudget = false;

  for (const p of ordered) {
    if (picked.length >= count) break;

    // 사진이 없는 상품은 API 를 쓰지 않고 건너뛴다. paused 로 내리지는 않는다
    // (사진은 나중에 채워질 수 있고, 다른 선정 경로는 이미 image_url 로 거른다).
    if (!p.image_url) continue;

    if (!overBudget && (checks >= opts.maxChecks || now() >= opts.deadlineAt)) {
      overBudget = true;
      console.warn(`대표 사진 검사 예산 소진(${checks}건) - 남은 자리는 검사 없이 채웁니다`);
    }
    if (overBudget) {
      picked.push(p);
      continue;
    }

    checks++;
    const verdict = await opts.check(p);
    // 검사 불가(null)는 통과로 친다
    if (!verdict || verdict.ok) {
      picked.push(p);
      continue;
    }
    console.log(`제외(대표 사진 · ${verdict.reason}): ${p.product_name.slice(0, 45)}`);
    rejected.push(p);
  }

  return { picked, rejected, checks };
}

/** takeFirstPassing 에 진짜 비전 검사와 paused 반영을 물린 것 */
async function takeWithImageCheck(
  ordered: Product[],
  count: number,
  opts?: { imageCheckBudgetMs?: number }
): Promise<Product[]> {
  if (count <= 0 || ordered.length === 0) return [];
  // 끄는 스위치는 스카우트와 같은 것을 쓴다 (한 상품을 두 군데서 다르게 볼 이유가 없다)
  if (process.env.SCOUT_IMAGE_CHECK === "off") return ordered.slice(0, count);

  const { checkProductImage } = await import("./productImageCheck");
  const { picked, rejected } = await takeFirstPassing(ordered, count, {
    check: (p) =>
      checkProductImage({ imageUrl: p.image_url, productName: p.product_name }),
    deadlineAt:
      Date.now() + (opts?.imageCheckBudgetMs ?? DEFAULT_IMAGE_CHECK_BUDGET_MS),
    maxChecks: maxImageChecks(count),
  });

  await pauseBadImageProducts(rejected.map((p) => p.id));
  return picked;
}

function score(product: Product): number {
  let s = 0;
  if (product.pain_point && product.pain_point.trim().length >= 4) s += 3;
  if (product.target_user && product.target_user.trim().length >= 2) s += 2;
  if (
    product.main_benefit &&
    product.main_benefit.trim().length >= 4 &&
    product.main_benefit.trim().length <= 40
  ) {
    s += 2;
  }
  if (PREFERRED_CATEGORIES.includes(product.category)) s += 2;
  if (DEPRIORITIZED_CATEGORIES.includes(product.category)) s -= 4;

  // "혹하는 정도"가 최우선 기준이다 (가격은 기준에서 뺐다 - 비싸도 상관없고,
  //  필요한 사람은 어차피 산다. 중요한 건 눌러보고 싶게 만드는 아이템인지).
  // 가중치를 크게 줘서 다른 항목보다 이 점수가 순위를 지배하게 한다.
  s += appealScore(product.product_name) * 2;
  return s;
}

/**
 * 숏폼 제작 대상 상품 선택.
 * - status = candidate 만 대상
 * - painPoint / targetUser / mainBenefit 이 명확한 상품 우선
 * - 우선 카테고리 가산점
 * - 동점이면 만들어진 영상 수가 적은 상품 우선 (골고루 테스트)
 * - 뽑힌 상품의 대표 사진을 한 장 검사해 부적합이면 다음 후보로 넘어간다
 */
export async function selectProductForVideo(opts?: {
  imageCheckBudgetMs?: number;
}): Promise<Product | null> {
  const db = supabaseAdmin();

  const { data: products, error } = await db
    .from("products")
    .select("*")
    .eq("status", "candidate");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  if (!products || products.length === 0) return null;

  const videoProductIds = await allVideoProductIds();
  const countByProduct = new Map<string, number>();
  for (const pid of videoProductIds) {
    countByProduct.set(pid, (countByProduct.get(pid) ?? 0) + 1);
  }

  // 정렬 1차 키는 "만든 영상 수"다. score 를 먼저 보면 점수 높은 같은 상품이
  // 계속 뽑혀, 미사용 재고를 수십 개 두고도 이미 영상이 있는 상품만 반복된다.
  // 안 만든 상품을 먼저 소진하고, 그 안에서 혹하는 순으로 고른다.
  const sorted = dropSpamTitles(products as Product[]).sort((a, b) => {
    const countDiff =
      (countByProduct.get(a.id) ?? 0) - (countByProduct.get(b.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  return (await takeWithImageCheck(sorted, 1, opts))[0] ?? null;
}

/**
 * 아직 영상이 없는(=앞으로 쓸 수 있는) 상품 재고 수.
 *
 * selectProductsForVideos 와 같은 조건으로 세므로 "내일 몇 편을 만들 수 있는지"를
 * 그대로 나타낸다. 재고 고갈 경보(worker/queue-runner.ts)에서 쓴다 - 실측
 * 2026-08-25 에 신규 유입이 나흘째 0인데도 워크플로가 계속 초록불이라 아무도
 * 몰랐던 일이 있었다. 재고는 발행이 멈추기 전에 미리 알아야 하는 유일한 지표다.
 */
export async function freshProductCount(): Promise<number> {
  const db = supabaseAdmin();
  const { data: products, error } = await db
    .from("products")
    .select("*")
    .eq("status", "candidate");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  if (!products || products.length === 0) return 0;

  const usedProductIds = new Set(await allVideoProductIds());
  return dropSpamTitles(
    (products as Product[]).filter((p) => !usedProductIds.has(p.id) && p.image_url)
  ).length;
}

/**
 * 하루치 영상 제작 대상 여러 개 선택 (완전 자동 파이프라인용).
 * - status = candidate 이고 아직 영상이 한 번도 안 만들어진 상품만
 * - 포맷 D 는 제품 카드에 사진이 필요하므로 image_url 있는 것만
 * - score 높은 순으로 정렬하되, 카테고리를 번갈아(라운드로빈) 뽑아
 *   배경 스톡영상이 겹치지 않게(청소/주방/육아 …) 다양성을 확보한다.
 * - 그 순서대로 대표 사진을 검사해, 통과한 상품으로 count 개를 채운다.
 */
export async function selectProductsForVideos(
  count: number,
  opts?: { imageCheckBudgetMs?: number }
): Promise<Product[]> {
  if (count <= 0) return [];
  const db = supabaseAdmin();

  const { data: products, error } = await db
    .from("products")
    .select("*")
    .eq("status", "candidate");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  if (!products || products.length === 0) return [];

  const usedProductIds = new Set(await allVideoProductIds());

  // 아직 영상이 없고 이미지가 있는 후보만 (스팸성 제목은 여기서 제외)
  const fresh = dropSpamTitles(
    (products as Product[]).filter((p) => !usedProductIds.has(p.id) && p.image_url)
  );
  if (fresh.length === 0) return [];

  fresh.sort((a, b) => {
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  // 카테고리별로 묶고(각 묶음은 이미 score 순), 라운드로빈으로 골라 다양성 확보
  const byCategory = new Map<string, Product[]>();
  for (const p of fresh) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  // 라운드로빈 순서:
  //  1) 비중을 줄일 카테고리는 항상 맨 뒤 (앞에서 count 를 채우면 그날은 안 뽑힘)
  //  2) 나머지는 날짜로 회전 - 매일 다른 카테고리가 맨 앞에 온다.
  //     고정 순서면 재고 많은 카테고리(생활템)가 매일 끼고 소수 카테고리(청소템)는
  //     계속 밀리므로, 시작점을 하루마다 한 칸씩 밀어 골고루 나가게 한다.
  const sorted = [...byCategory.keys()].sort(
    (a, b) =>
      (DEPRIORITIZED_CATEGORIES.includes(a) ? 1 : 0) -
      (DEPRIORITIZED_CATEGORIES.includes(b) ? 1 : 0)
  );
  const main = sorted.filter((c) => !DEPRIORITIZED_CATEGORIES.includes(c));
  const rest = sorted.filter((c) => DEPRIORITIZED_CATEGORIES.includes(c));
  const offset = main.length > 0 ? kstDayIndex() % main.length : 0;
  const categories = [...main.slice(offset), ...main.slice(0, offset), ...rest];

  // 여기서는 count 개로 자르지 않고 후보 전체를 "뽑을 순서"로 늘어놓는다.
  // 대표 사진 검사에서 앞쪽이 떨어지면 그 다음 순번으로 자연히 메워야 하기
  // 때문이다 (잘라두면 떨어진 만큼 그날 편수가 빈다).
  const ordered: Product[] = [];
  for (let round = 0; ; round++) {
    let progressed = false;
    for (const cat of categories) {
      const list = byCategory.get(cat)!;
      if (round < list.length) {
        ordered.push(list[round]);
        progressed = true;
      }
    }
    if (!progressed) break; // 더 뽑을 후보가 없음
  }

  return takeWithImageCheck(ordered, count, opts);
}

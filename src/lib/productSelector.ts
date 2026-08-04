import type { Product } from "@/types/db";
import { supabaseAdmin } from "./supabase";

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

/** 클릭이 잘 나오는 가격 하한 (원) - 3만원 미만은 감점 */
const PREFERRED_MIN_PRICE = 30000;

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

  // 가격대 가산: 3만원 이상이 노출일당 클릭이 더 높게 나온다.
  // (비싼 제품은 "가격 궁금해서 눌러보는" 클릭 미끼로도 작동)
  const won = parsePriceWon(product.price_text);
  if (won !== null && won >= PREFERRED_MIN_PRICE) s += 3;
  return s;
}

/**
 * 숏폼 제작 대상 상품 선택.
 * - status = candidate 만 대상
 * - painPoint / targetUser / mainBenefit 이 명확한 상품 우선
 * - 우선 카테고리 가산점
 * - 동점이면 만들어진 영상 수가 적은 상품 우선 (골고루 테스트)
 */
export async function selectProductForVideo(): Promise<Product | null> {
  const db = supabaseAdmin();

  const { data: products, error } = await db
    .from("products")
    .select("*")
    .eq("status", "candidate");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  if (!products || products.length === 0) return null;

  const { data: videoCounts, error: vcError } = await db
    .from("video_items")
    .select("product_id");
  if (vcError) throw new Error(`영상 수 조회 실패: ${vcError.message}`);

  const countByProduct = new Map<string, number>();
  for (const row of videoCounts ?? []) {
    countByProduct.set(row.product_id, (countByProduct.get(row.product_id) ?? 0) + 1);
  }

  const sorted = (products as Product[]).slice().sort((a, b) => {
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    const countDiff =
      (countByProduct.get(a.id) ?? 0) - (countByProduct.get(b.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  return sorted[0];
}

/**
 * 하루치 영상 제작 대상 여러 개 선택 (완전 자동 파이프라인용).
 * - status = candidate 이고 아직 영상이 한 번도 안 만들어진 상품만
 * - 포맷 D 는 제품 카드에 사진이 필요하므로 image_url 있는 것만
 * - score 높은 순으로 정렬하되, 카테고리를 번갈아(라운드로빈) 뽑아
 *   배경 스톡영상이 겹치지 않게(청소/주방/육아 …) 다양성을 확보한다.
 */
export async function selectProductsForVideos(count: number): Promise<Product[]> {
  if (count <= 0) return [];
  const db = supabaseAdmin();

  const { data: products, error } = await db
    .from("products")
    .select("*")
    .eq("status", "candidate");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  if (!products || products.length === 0) return [];

  const { data: videoRows, error: vcError } = await db
    .from("video_items")
    .select("product_id");
  if (vcError) throw new Error(`영상 수 조회 실패: ${vcError.message}`);
  const usedProductIds = new Set((videoRows ?? []).map((r) => r.product_id));

  // 아직 영상이 없고 이미지가 있는 후보만
  const fresh = (products as Product[]).filter(
    (p) => !usedProductIds.has(p.id) && p.image_url
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

  const picked: Product[] = [];
  for (let round = 0; picked.length < count; round++) {
    let progressed = false;
    for (const cat of categories) {
      const list = byCategory.get(cat)!;
      if (round < list.length) {
        picked.push(list[round]);
        progressed = true;
        if (picked.length >= count) break;
      }
    }
    if (!progressed) break; // 더 뽑을 후보가 없음
  }
  return picked;
}

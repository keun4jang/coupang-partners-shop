import type { Product } from "@/types/db";
import { supabaseAdmin } from "./supabase";

/** 숏폼에 우선 배정할 카테고리 */
const PREFERRED_CATEGORIES = [
  "생활템",
  "청소템",
  "수납템",
  "주방템",
  "차량용품",
  "육아생활템",
];

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
  const categories = [...byCategory.keys()];

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

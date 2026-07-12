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

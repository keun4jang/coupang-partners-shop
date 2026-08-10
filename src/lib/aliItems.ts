import { supabaseAdmin } from "./supabase";
import type { AliItem } from "@/types/db";
import { generateAffiliateLink, hasAffiliateEnv } from "./aliexpressAffiliate";
import { isValidHttpUrl } from "./format";

/**
 * 랜딩에 얹는 알리익스프레스 제휴 상품.
 *
 * 어필리에이트 승인 전에도 상품을 등록해 둘 수 있게 만들었다.
 * - 승인 전: product_url(원본)로 나간다. 클릭은 기록되지만 수수료는 없다.
 * - 승인 후: refreshAffiliateLinks() 가 제휴 링크를 채워 넣고, 그때부터 수수료가 붙는다.
 */

/** 랜딩에 노출할 상품 (정렬: sort_order → 최신순) */
export async function visibleAliItems(): Promise<AliItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("ali_items")
    .select("*")
    .eq("landing_visible", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // 마이그레이션 전이면 테이블이 없을 수 있다. 랜딩이 통째로 죽으면 안 되므로 빈 배열.
    console.warn("알리 상품 조회 실패:", error.message);
    return [];
  }
  return (data as AliItem[] | null) ?? [];
}

export async function allAliItems(): Promise<AliItem[]> {
  const { data, error } = await supabaseAdmin()
    .from("ali_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`알리 상품 조회 실패: ${error.message}`);
  return (data as AliItem[] | null) ?? [];
}

export async function getAliItem(id: string): Promise<AliItem | null> {
  const { data } = await supabaseAdmin()
    .from("ali_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AliItem | null) ?? null;
}

/** 알리 상품 URL 에서 상품 ID 추출 (…/item/1005006174936660.html) */
export function aliProductIdFromUrl(url: string): string | null {
  return url.match(/\/item\/(\d{6,})\.html/)?.[1] ?? null;
}

export interface NewAliItem {
  title: string;
  product_url: string;
  image_url?: string | null;
  price_text?: string | null;
  landing_visible?: boolean;
  sort_order?: number;
}

/**
 * 상품 등록. 어필리에이트가 준비돼 있으면 제휴 링크까지 즉시 만들어 저장한다.
 * 준비 전이면 affiliate_url 은 비워두고, 나중에 refreshAffiliateLinks() 로 채운다.
 */
export async function addAliItem(input: NewAliItem): Promise<AliItem> {
  const url = input.product_url.trim();
  if (!isValidHttpUrl(url)) throw new Error("상품 URL 이 올바르지 않습니다 (http/https)");
  if (!input.title.trim()) throw new Error("상품명이 비어 있습니다");

  const affiliateUrl = hasAffiliateEnv() ? await generateAffiliateLink(url) : null;
  const row = {
    ali_product_id: aliProductIdFromUrl(url),
    title: input.title.trim(),
    image_url: input.image_url?.trim() || null,
    price_text: input.price_text?.trim() || null,
    product_url: url,
    affiliate_url: affiliateUrl,
    landing_visible: input.landing_visible ?? true,
    sort_order: input.sort_order ?? 0,
  };
  const { data, error } = await supabaseAdmin()
    .from("ali_items")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(`알리 상품 저장 실패: ${error.message}`);
  return data as AliItem;
}

export async function setAliItemVisible(id: string, visible: boolean): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ali_items")
    .update({ landing_visible: visible })
    .eq("id", id);
  if (error) throw new Error(`노출 설정 실패: ${error.message}`);
}

export async function deleteAliItem(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("ali_items").delete().eq("id", id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

/**
 * 제휴 링크가 비어 있는 상품에 링크를 채운다 (어필리에이트 승인 직후 1회 실행).
 * 승인 전에 등록해 둔 상품들이 한 번에 수수료 링크로 바뀐다.
 */
export async function refreshAffiliateLinks(): Promise<{
  updated: number;
  skipped: number;
  reason?: string;
}> {
  if (!hasAffiliateEnv()) {
    return { updated: 0, skipped: 0, reason: "어필리에이트 미설정 (키/Tracking ID 확인)" };
  }
  const { data } = await supabaseAdmin()
    .from("ali_items")
    .select("*")
    .is("affiliate_url", null);
  const items = (data as AliItem[] | null) ?? [];
  let updated = 0;
  let skipped = 0;
  for (const it of items) {
    const link = await generateAffiliateLink(it.product_url);
    if (!link) {
      skipped++;
      continue;
    }
    const { error } = await supabaseAdmin()
      .from("ali_items")
      .update({ affiliate_url: link })
      .eq("id", it.id);
    if (error) skipped++;
    else updated++;
  }
  return { updated, skipped };
}

/** 실제로 내보낼 주소 (제휴 링크 우선, 없으면 원본) */
export function aliTargetUrl(item: AliItem): string {
  return item.affiliate_url || item.product_url;
}

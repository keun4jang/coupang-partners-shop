import { supabaseAdmin } from "./supabase";
import {
  CoupangProduct,
  SCOUT_KEYWORDS,
  searchProducts,
  priceText,
} from "./coupang";
import { dateFolderName } from "./format";

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
  productId: number;
  product_name: string;
  category: string;
  price_text: string;
  coupang_partner_url: string;
  image_url: string;
  source_memo: string;
}

export interface ScoutResult {
  registered: ScoutCandidate[];
  skippedDuplicate: number;
  skippedFiltered: number;
  errors: string[];
}

const CPID_RE = /\[cpid:(\d+)\]/;

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
  const minPrice = opts.minPrice ?? 5000;
  const maxPrice = opts.maxPrice ?? 200000;

  const errors: string[] = [];
  const known = await loadKnownProductIds();
  const today = dateFolderName();

  // 키워드별로 후보 목록을 만들어 둔다(우선순위 순).
  const buckets: ScoutCandidate[][] = [];
  for (const kw of SCOUT_KEYWORDS) {
    try {
      const products = await searchProducts(kw.keyword, perKeywordFetch);
      const bucket: ScoutCandidate[] = [];
      for (const p of products) {
        if (!passesFilter(p, minPrice, maxPrice)) continue;
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

  if (registered.length > 0 && !opts.dryRun) {
    const rows = registered.map((c) => ({
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

  return { registered, skippedDuplicate, skippedFiltered, errors };
}

/** 텔레그램 요약 메시지 */
export function formatScoutMessage(result: ScoutResult): string {
  if (result.registered.length === 0) {
    const base = "🔎 오늘 스카우트: 새 후보가 없어요 (이미 있는 상품이거나 필터 제외).";
    return result.errors.length ? `${base}\n\n⚠️ ${result.errors.join("\n")}` : base;
  }
  const lines = result.registered.map(
    (c, i) => `${i + 1}. [${c.category}] ${c.product_name} · ${c.price_text}`
  );
  const tail =
    "\n\n영상 만들 후보를 고르려면 관리자 페이지에서 확인하거나, 텔레그램 '영상' 을 보내주세요.";
  const warn = result.errors.length ? `\n\n⚠️ 일부 카테고리 오류:\n${result.errors.join("\n")}` : "";
  return `🔎 오늘의 상품 후보 ${result.registered.length}개 올라왔어요\n\n${lines.join("\n")}${tail}${warn}`;
}

/**
 * "영상 먼저" 방식용 (2026-11-27 사장님 "추천대로 진행"): 1688 에서 좋은 사용 영상을 먼저 고른 뒤, 그 물건을 쿠팡에서 찾아 번호를 매긴다.
 * real-find 워크플로에서만 돈다(mode=search / add). 쿠팡 호출은 src/lib/coupang.ts searchProducts → 장부를 거치고, 한 번 실행에 딱 1회다.
 *
 *   tsx scripts/real-find.ts search "<검색어>"                → 결과 10개를 보여 주기만 한다(저장 안 함)
 *   tsx scripts/real-find.ts add "<검색어>" <쿠팡 productId> [카테고리]
 *        → 같은 검색을 한 번 더 해서 그 상품을 products 에 넣고(이미 있으면 그대로) 실제 영상용 번호를 매긴다.
 *
 * 번호는 real-number.ts 와 같은 모양(video_status=completed · manual · "[실제영상]" · 번호 페이지는 게시 때 열림)이라 렌더 작업이 집어 가지 않는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { loadCoupangCredsFromSettings, priceText, searchProducts } from "../src/lib/coupang";
import { findPolicyIssues } from "../src/lib/policy";
import { supabaseAdmin } from "../src/lib/supabase";
import { createVideoItem } from "../src/lib/videoItems";
import type { Product } from "../src/types/db";

const REAL_MARK = "[실제영상]";

async function main() {
  const [mode, keywordRaw, pidRaw, catRaw] = process.argv.slice(2);
  const keyword = (keywordRaw ?? "").trim();
  if (!["search", "add"].includes(mode) || keyword.length < 2 || keyword.length > 40) {
    throw new Error('사용: real-find.ts search "<검색어>"  |  real-find.ts add "<검색어>" <productId> [카테고리]');
  }
  await loadCoupangCredsFromSettings();
  const items = await searchProducts(keyword, 10); // 쿠팡 호출은 이 한 번뿐
  console.log(`검색어 "${keyword}" 결과 ${items.length}개`);
  items.forEach((p, i) => {
    console.log(`FOUND ${i + 1} | ${p.productId} | ${priceText(p.productPrice)} | ${p.isRocket ? "로켓" : "-"} | ${p.productName} | ${p.productImage}`);
  });
  if (mode === "search") return;

  const pid = Number(pidRaw);
  const hit = items.find((p) => p.productId === pid);
  if (!hit) throw new Error(`productId ${pidRaw} 가 이번 검색 결과에 없습니다 (검색어를 그대로 쓰세요)`);
  const issues = findPolicyIssues(hit.productName);
  if (issues.length) console.log(`참고 - 상품 이름에 정책 낱말: ${issues.join(", ")} (게시 문구는 docs/real-videos 의 name 으로 따로 쓴다)`);

  const db = supabaseAdmin();
  const { data: known, error: kErr } = await db.from("products").select("*").ilike("source_memo", `%[cpid:${pid}]%`).limit(1).maybeSingle();
  if (kErr) throw new Error(`상품 조회 실패: ${kErr.message}`);
  let product = known as Product | null;
  if (!product) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: made, error: iErr } = await db
      .from("products")
      .insert({
        source: "coupang",
        product_name: hit.productName,
        category: (catRaw ?? "").trim() || "생활템",
        price_text: priceText(hit.productPrice),
        coupang_partner_url: hit.productUrl,
        image_url: hit.productImage || null,
        source_memo: `실제영상 · '${keyword}' 검색 · [cpid:${pid}] · ${today}`,
        status: "paused", // 꺼 둔 자동 영상 선정에 섞이지 않게
      })
      .select("*")
      .single();
    if (iErr || !made) throw new Error(`상품 저장 실패: ${iErr?.message}`);
    product = made as Product;
    console.log(`상품 저장: ${product.product_name}`);
  } else {
    console.log(`이미 있는 상품: ${product.product_name}`);
  }

  const { data: had, error: hErr } = await db
    .from("video_items")
    .select("display_number")
    .eq("product_id", product.id)
    .eq("broll_origin", REAL_MARK)
    .order("display_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (hErr) throw new Error(`영상 기록 조회 실패: ${hErr.message}`);
  if (had) {
    console.log(`번호: ${had.display_number} (이미 있음) - ${product.product_name}`);
    return;
  }
  const item = await createVideoItem(product, undefined, { manual: true });
  const { error: uErr } = await db.from("video_items").update({ video_status: "completed", broll_origin: REAL_MARK }).eq("id", item.id);
  if (uErr) throw new Error(`영상 기록 표시 실패(${item.display_number}번): ${uErr.message}`);
  console.log(`번호: ${item.display_number} (새로 만듦) - ${product.product_name}`);
  console.log(`IMGURL ${product.image_url ?? ""}`);
}
main().catch((e) => {
  console.error((e as Error).message.slice(0, 300));
  process.exit(1);
});

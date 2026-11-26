/**
 * 실제 사용 영상용 번호 매기기 (2026-11-26 - 자동 영상을 껐기 때문에 새 본인 상품은 번호가 생기지 않는다).
 * 사용: tsx scripts/real-number.ts <쿠팡 윙 등록상품ID>   (real-upload 워크플로 publish=newnumber 에서만 돈다)
 *
 * 하는 일
 * - src/lib/ownProducts.ts OWN_PRODUCTS 를 DB 와 맞춘다(ensureOwnProducts - 예전에는 큐잉 때마다 하던 일).
 * - 그 상품의 "실제 영상용" 영상 기록이 없으면 새 번호로 하나 만든다. 이미 있으면 그 번호를 그대로 알려 준다(여러 번 돌려도 하나).
 * - 기록은 video_status=completed · manual=true 로 둬서 렌더 작업이 집어 가지 않는다. 번호 페이지는 닫힌 채(landing_visible=false)이고
 *   게시할 때 real-upload 가 연다.
 * - 쿠팡 API 는 부르지 않는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";
import { createVideoItem, ensureOwnProducts } from "../src/lib/videoItems";
import type { Product } from "../src/types/db";

const REAL_MARK = "[실제영상]";

async function main() {
  const inv = (process.argv[2] ?? "").trim();
  if (!/^\d{6,}$/.test(inv)) throw new Error("사용: real-number.ts <등록상품ID(숫자)>");
  const r = await ensureOwnProducts();
  console.log(`본인 상품 맞춤: 추가 ${r.added} · 갱신 ${r.updated}`);

  const db = supabaseAdmin();
  const { data: product, error } = await db.from("products").select("*").ilike("source_memo", `%[own:${inv}]%`).maybeSingle();
  if (error || !product) throw new Error(`등록상품ID ${inv} 상품을 찾지 못했습니다 (ownProducts.ts 에 먼저 넣어야 합니다)`);

  const { data: had, error: hErr } = await db
    .from("video_items")
    .select("display_number")
    .eq("product_id", (product as Product).id)
    .eq("broll_origin", REAL_MARK)
    .order("display_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (hErr) throw new Error(`영상 기록 조회 실패: ${hErr.message}`);
  if (had) {
    console.log(`번호: ${had.display_number} (이미 있음) - ${(product as Product).product_name}`);
    return;
  }

  const item = await createVideoItem(product as Product, undefined, { manual: true });
  const { error: uErr } = await db.from("video_items").update({ video_status: "completed", broll_origin: REAL_MARK }).eq("id", item.id);
  if (uErr) throw new Error(`영상 기록 표시 실패(${item.display_number}번): ${uErr.message}`);
  console.log(`번호: ${item.display_number} (새로 만듦) - ${(product as Product).product_name}`);
}
main().catch((e) => {
  console.error((e as Error).message.slice(0, 300));
  process.exit(1);
});

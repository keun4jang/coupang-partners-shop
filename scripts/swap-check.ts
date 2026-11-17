/**
 * 꿀팁 교체 실패 점검 (읽기만) - 2026-11-16 626·627번 "정보 꿀팁 주제가 맞지 않아" 실패 원인 확인.
 * 해당 번호의 상태·수동 여부·상품과, 바꿔 넣을 후보(candidate·영상 없음·사진 있음)·그중 꿀팁 규칙에 맞는 수를 본다. 쓰기 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { supabaseAdmin } from "../src/lib/supabase";
import { matchTipTopicsByRule } from "../src/lib/tipMatch";

async function main() {
  const db = supabaseAdmin();
  const { data: items } = await db
    .from("video_items")
    .select("display_number, video_status, manual, publish_mode, error_message, updated_at, published_at, youtube_url, instagram_url, products(product_name, status, category)")
    .gte("display_number", 615)
    .order("display_number");
  for (const r of (items ?? []) as any[])
    console.log(`${r.display_number}번 ${r.video_status} 게시=${r.published_at?.slice(0, 16) ?? '-'} yt=${r.youtube_url ? 'O' : '-'} ig=${r.instagram_url ? 'O' : '-'} manual=${r.manual} mode=${r.publish_mode} ${r.updated_at?.slice(0, 16)} | ${r.products?.product_name?.slice(0, 30)} (${r.products?.status}) | ${(r.error_message ?? "").slice(0, 60)}`);
  const cands: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("products").select("id, product_name, image_url").eq("status", "candidate").order("created_at").range(from, from + 999);
    cands.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const used: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("video_items").select("product_id").range(from, from + 999);
    used.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const usedIds = new Set(((used ?? []) as any[]).map((u) => u.product_id));
  const fresh = ((cands ?? []) as any[]).filter((p) => !usedIds.has(p.id) && p.image_url);
  const ruled = fresh.filter((p) => matchTipTopicsByRule(p.product_name).length > 0);
  console.log(`\n후보 candidate ${cands.length}개 · 영상 없고 사진 있음 ${fresh.length}개 · 그중 꿀팁 규칙 맞음 ${ruled.length}개`);
  const { count: pausedToday } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "paused")
    .ilike("source_memo", `%꿀팁없음 ${new Date().toISOString().slice(0, 10)}%`);
  console.log(`오늘 꿀팁없음으로 뺀 상품: ${pausedToday ?? 0}개`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

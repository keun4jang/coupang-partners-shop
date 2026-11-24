/**
 * 영상 후보의 제품이 우리 상품 DB 에 있는지 찾기 (읽기만) - 2026-11-24.
 * 아래 KEYWORDS 를 상품명에서 찾아 상태·영상 번호와 함께 보여 준다. 쿠팡 API 호출 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";

const KEYWORDS = ["뚜껑 정리", "뚜껑정리", "뚜껑 거치", "뚜껑거치", "뚜껑 보관", "뚜껑보관", "뚜껑 수납", "뚜껑수납", "뚜껑 스탠드", "밀폐용기 정리", "밀폐용기정리"];

async function main() {
  const db = supabaseAdmin();
  const or = KEYWORDS.map((k) => `product_name.ilike.%${k}%`).join(",");
  const { data, error } = await db.from("products").select("id, product_name, status, image_url").or(or).limit(60);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; product_name: string; status: string; image_url: string | null }[];
  const { data: vids } = await db.from("video_items").select("product_id, display_number, video_status").in("product_id", rows.map((r) => r.id));
  const byId = new Map<string, string[]>();
  for (const v of (vids ?? []) as { product_id: string; display_number: number; video_status: string }[]) {
    byId.set(v.product_id, [...(byId.get(v.product_id) ?? []), `${v.display_number}번 ${v.video_status}`]);
  }
  // 1688 공장 찾기용: 대기열 상품의 전체 이름·대표 사진 주소 (2026-11-24)
  const { data: queued } = await db
    .from("video_items")
    .select("display_number, video_status, products(product_name, image_url)")
    .in("display_number", [664, 672, 679, 681, 685, 692]);
  for (const q of (queued ?? []) as unknown as { display_number: number; video_status: string; products: { product_name: string; image_url: string | null } }[]) {
    console.log(`대기상품	${q.display_number}	${q.video_status}	${q.products.product_name}	${q.products.image_url}`);
  }
  const lid = rows.find((r) => r.product_name.includes("수납장 상부 부착형"));
  if (lid) console.log(`대기상품	0	후보	${lid.product_name}	${lid.image_url}`);
  console.log(`찾은 상품 ${rows.length}개`);
  for (const r of rows) console.log(`상품: [${r.status}] ${r.product_name.slice(0, 60)} | 사진 ${r.image_url ? "O" : "X"} | 영상 ${byId.get(r.id)?.join(", ") ?? "없음"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

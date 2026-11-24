/** 실제 영상 끝 화면용 상품 사진 주소를 출력한다 (읽기만). 사용: tsx scripts/real-video-image.ts 686 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";

async function main() {
  const n = Number(process.argv[2]);
  const { data } = await supabaseAdmin().from("video_items").select("products(image_url)").eq("display_number", n).maybeSingle();
  const url = (data as unknown as { products: { image_url: string | null } } | null)?.products?.image_url;
  if (!url) throw new Error(`${n}번 상품 사진 없음`);
  process.stdout.write(url);
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

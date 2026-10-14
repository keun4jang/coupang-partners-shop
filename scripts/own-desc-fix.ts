/**
 * 이미 올라간 본인 상품 쇼츠의 유튜브 설명에서 판매자 이름 '근사장' 을 뺀다 (2026-10-14 사장님 요청).
 *  "근사장이 쿠팡에서 직접 판매하는 제품이에요." → "제가 쿠팡에서 직접 판매하는 제품이에요."
 *  "근사장이 …" → "제가 …", 해시태그 "#근사장" → "#살림템" (이미 #살림템 이 있으면 지운다)
 * 제목·태그는 건드리지 않는다(updateYoutubeDescription 이 현재 snippet 을 보존). 이미 고친 영상은 건너뛴다.
 * 인스타 캡션은 게시 후 API 로 수정할 수 없어 대상이 아니다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";
import { getYoutubeDescription, loadYoutubeCredsFromSettings, updateYoutubeDescription } from "../src/lib/youtube";
import { OWN_MARKER } from "../src/lib/ownProducts";

const idOf = (url: string): string | null =>
  url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null;

export function stripSellerName(desc: string): string {
  let out = desc.replace(/근사장이\s/g, "제가 ").replace(/근사장\s*본인/g, "제가 직접");
  out = out.includes("#살림템") ? out.replace(/\s?#근사장(?![가-힣])/g, "") : out.replace(/#근사장/g, "#살림템");
  return out.replace(/근사장/g, "").replace(/[ \t]{2,}/g, " ");
}

async function main(): Promise<void> {
  await loadYoutubeCredsFromSettings();
  const { data, error } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, youtube_url, products!inner(source_memo)")
    .like("products.source_memo", `%${OWN_MARKER}%`)
    .not("youtube_url", "is", null)
    .order("display_number");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { display_number: number; youtube_url: string }[];
  console.log(`본인 상품 유튜브 영상 ${rows.length}편`);
  let fixed = 0;
  for (const r of rows) {
    const id = idOf(r.youtube_url);
    if (!id) continue;
    const desc = await getYoutubeDescription(id);
    if (desc == null) {
      console.log(`${r.display_number}번 ${id}: 조회 실패(삭제·비공개?) - 건너뜀`);
      continue;
    }
    if (!desc.includes("근사장")) {
      console.log(`${r.display_number}번 ${id}: 이미 이름 없음 - 건너뜀`);
      continue;
    }
    await updateYoutubeDescription(id, stripSellerName(desc));
    fixed++;
    console.log(`${r.display_number}번 ${id}: 설명 수정 완료`);
  }
  console.log(`수정 ${fixed}편`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

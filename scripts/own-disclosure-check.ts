/**
 * 본인 상품 고지 실물 점검 (읽기만) - 2026-11-24 611번 "판매자고지×" 확인.
 * publish-status 는 DB 의 AI 초안(caption_text)만 보는데, 실제 고지는 발행 직전 publishCopy 가 붙인다.
 * 그래서 유튜브에 실제로 올라간 설명을 읽어 판매자 고지가 있는지, 파트너스 문구가 잘못 섞이지 않았는지 본다.
 * 호출: Supabase 읽기, YouTube Data videos.list 읽기. 쓰기 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

type Row = { display_number: number; youtube_url: string | null; caption_text: string | null };
const vid = (u: string | null) => u?.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;

async function main() {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_OAUTH_CLIENT_ID!, process.env.YOUTUBE_OAUTH_CLIENT_SECRET!);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const yt = google.youtube({ version: "v3", auth: oauth2 });

  const { data, error } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, youtube_url, caption_text, products!inner(source_memo)")
    .like("products.source_memo", "%[own]%")
    .not("youtube_url", "is", null)
    .order("display_number");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const desc = new Map<string, string>();
  const ids = rows.map((r) => vid(r.youtube_url)).filter((x): x is string => !!x);
  for (let i = 0; i < ids.length; i += 50) {
    const res = await yt.videos.list({ part: ["snippet"], id: ids.slice(i, i + 50) });
    for (const v of res.data.items ?? []) desc.set(v.id!, v.snippet?.description ?? "");
  }

  let ok = 0;
  const bad: string[] = [];
  for (const r of rows) {
    const id = vid(r.youtube_url);
    const d = id ? desc.get(id) : undefined;
    const draft = /직접 판매하(는 제품|고 있습니다)/.test((r.caption_text ?? "")) ? "초안○" : "초안×";
    if (d === undefined) {
      bad.push(`${r.display_number}번 유튜브에서 못 읽음 (${draft})`);
      continue;
    }
    const seller = /직접 판매하(는 제품|고 있습니다)/.test(d);
    const partner = d.includes("쿠팡파트너스");
    if (seller && !partner) ok++;
    else bad.push(`${r.display_number}번 판매자고지 ${seller ? "○" : "×"} · 파트너스문구 ${partner ? "있음" : "없음"} (${draft})`);
    if (r.display_number === 611) console.log(`611번 실제 유튜브 설명: 판매자고지 ${seller ? "○" : "×"} · 파트너스문구 ${partner ? "있음" : "없음"} (${draft})`);
  }
  console.log(`본인 상품 유튜브 영상 ${rows.length}편 · 정상 ${ok}편 · 확인 필요 ${bad.length}편`);
  for (const b of bad) console.log(`  ${b}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

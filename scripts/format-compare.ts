/**
 * 형식별 비교 (읽기만) - 11/15 재판정용. 유튜브에 올라간 영상을 형식으로 나눠 편당 조회 중앙값·유효 조회 비율을 본다.
 *  예전 상품 영상(9/28~10/21, 꿀팁 표시 없음) · 꿀팁(broll_origin "꿀팁:", "[드라마]" 아님) · 드라마("[드라마]").
 *  조회는 영상 전체 누적(videos.list), 유효 비율은 게시 후 기간의 Analytics(engagedViews/views).
 *  영상 나이가 다르므로 "게시 3일 이상 지난 영상"만, 게시 후 7일 안 조회도 따로 본다(Analytics, 영상별 기간).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

type Row = { display_number: number; youtube_url: string | null; broll_origin: string | null; published_at: string | null };
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const vid = (u: string | null) => u?.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;

async function main() {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_OAUTH_CLIENT_ID!, process.env.YOUTUBE_OAUTH_CLIENT_SECRET!);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth2 });

  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, youtube_url, broll_origin, published_at")
    .gte("published_at", "2026-09-28T00:00:00Z")
    .not("youtube_url", "is", null);
  const now = Date.now();
  const rows = ((data ?? []) as Row[]).filter((r) => r.published_at && now - Date.parse(r.published_at) >= 3 * 86_400_000);
  const group = (r: Row) =>
    (r.broll_origin ?? "").includes("[병맛]") ? "병맛 드라마" : (r.broll_origin ?? "").includes("[드라마]") ? "드라마" : (r.broll_origin ?? "").includes("꿀팁:") ? "꿀팁" : "예전 상품 영상";

  type Stat = { n: number; views7: number; engaged7: number };
  const per: Record<string, Stat[]> = {};
  for (const r of rows) {
    const id = vid(r.youtube_url);
    if (!id) continue;
    const start = r.published_at!.slice(0, 10);
    const end = new Date(Math.min(now, Date.parse(r.published_at!) + 7 * 86_400_000)).toISOString().slice(0, 10);
    try {
      const res = await analytics.reports.query({ ids: "channel==MINE", startDate: start, endDate: end, filters: `video==${id}`, metrics: "views,engagedViews" });
      const row = (res.data.rows ?? [])[0] as number[] | undefined;
      const g = group(r);
      (per[g] ??= []).push({ n: r.display_number, views7: Number(row?.[0] ?? 0), engaged7: Number(row?.[1] ?? 0) });
    } catch (e) {
      console.log(`  ${r.display_number}번 조회 실패: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  console.log("── 형식별 비교 (게시 후 7일, 게시 3일 이상 지난 유튜브 영상) ──");
  for (const g of ["예전 상품 영상", "꿀팁", "드라마", "병맛 드라마"]) {
    const s = per[g] ?? [];
    const v = s.map((x) => x.views7);
    const tv = v.reduce((a, b) => a + b, 0);
    const te = s.reduce((a, b) => a + b.engaged7, 0);
    console.log(`${g.padEnd(10)} ${String(s.length).padStart(3)}편 · 조회 중앙값 ${isNaN(median(v)) ? "-" : median(v)} · 평균 ${s.length ? Math.round(tv / s.length) : "-"} · 유효 조회 비율 ${tv ? ((te / tv) * 100).toFixed(1) : "-"}%`);
    if (g === "드라마" || g === "병맛 드라마") for (const x of s) console.log(`    ${x.n}번 조회 ${x.views7} · 유효 ${x.views7 ? ((x.engaged7 / x.views7) * 100).toFixed(0) : "-"}%`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

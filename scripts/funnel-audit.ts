/**
 * 퍼널 점검 (읽기만) - 2026-11-24 사장님 "지금까지 상황 보고 분석하고 다른 방안 기획해봐".
 * ① /n 방문이 사람인가: 번호별 방문 수와 '게시 뒤 며칠째 찍혔나'(게시 당일 1건씩이면 자동 접속 의심)
 * ② 유튜브 시청자가 쿠팡 손님이 될 수 있나: 나라·연령·성별, 유입 경로, 구독자 증감
 * 호출: Supabase 읽기, YouTube Data·Analytics 읽기. 쓰기 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

const DAYS = 30;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

async function landing() {
  const db = supabaseAdmin();
  const since = iso(Date.now() - DAYS * 86_400_000);
  const { data: ev, error } = await db
    .from("product_event_daily")
    .select("event_date, display_number, event_type, source, event_count")
    .gte("event_date", since)
    .limit(5000);
  if (error) throw new Error(error.message);
  const rows = (ev ?? []) as { event_date: string; display_number: number; event_type: string; source: string; event_count: number }[];
  const nums = [...new Set(rows.map((r) => r.display_number))];
  const { data: items } = await db.from("video_items").select("display_number, published_at").in("display_number", nums);
  const pub = new Map(((items ?? []) as { display_number: number; published_at: string | null }[]).map((i) => [i.display_number, i.published_at]));

  const views = rows.filter((r) => r.event_type === "landing_view");
  const clicks = rows.filter((r) => r.event_type === "outbound_click");
  const sum = (a: typeof rows) => a.reduce((s, r) => s + r.event_count, 0);
  console.log(`── ① 최근 ${DAYS}일 /n 방문 ${sum(views)}건 · 번호 ${new Set(views.map((r) => r.display_number)).size}개 · 쿠팡 이동 ${sum(clicks)}건 ──`);
  const bySource = new Map<string, number>();
  for (const r of views) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.event_count);
  console.log("경로별 방문: " + [...bySource].map(([k, v]) => `${k} ${v}`).join(" · "));

  const perNum = new Map<number, number>();
  for (const r of views) perNum.set(r.display_number, (perNum.get(r.display_number) ?? 0) + r.event_count);
  const dist = new Map<string, number>();
  for (const c of perNum.values()) {
    const k = c >= 3 ? "3건+" : `${c}건`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  console.log("번호당 방문 수 분포: " + [...dist].sort().map(([k, v]) => `${k}=${v}개 번호`).join(" · "));

  const lag = new Map<string, number>();
  for (const r of views) {
    const p = pub.get(r.display_number);
    if (!p) {
      lag.set("게시 기록 없음", (lag.get("게시 기록 없음") ?? 0) + r.event_count);
      continue;
    }
    const pubKst = iso(Date.parse(p) + 9 * 3_600_000);
    const d = Math.round((Date.parse(r.event_date) - Date.parse(pubKst)) / 86_400_000);
    const pubUtc = iso(Date.parse(p));
    const same = r.event_date === pubKst || r.event_date === pubUtc;
    const k = same ? "게시 당일" : d < 0 ? "게시 전" : d <= 2 ? "1~2일 뒤" : "3일 이상 뒤";
    lag.set(k, (lag.get(k) ?? 0) + r.event_count);
  }
  console.log("방문 시점: " + [...lag].map(([k, v]) => `${k} ${v}`).join(" · "));
}

async function youtube() {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_OAUTH_CLIENT_ID!, process.env.YOUTUBE_OAUTH_CLIENT_SECRET!);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth2 });
  const yt = google.youtube({ version: "v3", auth: oauth2 });
  const startDate = iso(Date.now() - DAYS * 86_400_000);
  const endDate = iso(Date.now());
  const q = async (label: string, params: Record<string, string | number>, fmt: (r: unknown[]) => string) => {
    try {
      const res = await analytics.reports.query({ ids: "channel==MINE", startDate, endDate, ...params });
      console.log(`${label}: ` + ((res.data.rows ?? []) as unknown[][]).map(fmt).join(" · "));
    } catch (e) {
      console.log(`${label}: 조회 실패 (${(e as Error).message.slice(0, 80)})`);
    }
  };
  console.log(`── ② 유튜브 최근 ${DAYS}일 ──`);
  const ch = await yt.channels.list({ part: ["statistics"], mine: true });
  const st = ch.data.items?.[0]?.statistics;
  console.log(`채널: 구독자 ${st?.subscriberCount} · 영상 ${st?.videoCount} · 누적 조회 ${st?.viewCount}`);
  await q("조회·구독", { metrics: "views,likes,shares,comments,subscribersGained,subscribersLost" }, (r) =>
    `조회 ${r[0]} · 좋아요 ${r[1]} · 공유 ${r[2]} · 댓글 ${r[3]} · 구독 +${r[4]} / -${r[5]}`
  );
  await q("나라(조회 상위)", { dimensions: "country", metrics: "views", sort: "-views", maxResults: 6 }, (r) => `${r[0]} ${r[1]}`);
  await q("유입 경로", { dimensions: "insightTrafficSourceType", metrics: "views", sort: "-views", maxResults: 6 }, (r) => `${r[0]} ${r[1]}`);
  await q("연령·성별(%)", { dimensions: "ageGroup,gender", metrics: "viewerPercentage", sort: "-viewerPercentage", maxResults: 6 }, (r) =>
    `${String(r[0]).replace("age", "")} ${r[1]} ${Number(r[2]).toFixed(0)}%`
  );
}

async function main() {
  await landing();
  await youtube();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

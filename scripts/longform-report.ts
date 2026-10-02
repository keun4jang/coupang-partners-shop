/**
 * 롱폼(TOP10) 실측 리포트 (2026-10-03, 새 전략 1일차).
 *
 * 왜: 새 전략의 가장 큰 가정은 "검색용 비교 롱폼(선반)이 검색에서 사람을 데려온다"이다.
 * 그런데 이미 8/23부터 매일 올린 TOP10 롱폼 약 40편이 검색형 제목·눌리는 링크를 갖고도
 * 사람 클릭이 거의 0이었다. 그 롱폼들이 실제로 몇 번 보였고, 어디서(검색·추천·채널)
 * 왔는지를 먼저 본다. 이 숫자로 선반 가정(월 15/40/150회)을 다시 계산한다.
 *
 * 읽기 전용: YouTube Data API(조회수)·Analytics API(유입 경로)만 부른다. 쿠팡 API 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

const idOf = (url: string): string | null =>
  url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function main(): Promise<void> {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_OAUTH_CLIENT_ID!,
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET!
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const yt = google.youtube({ version: "v3", auth: oauth2 });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth2 });

  const { data, error } = await supabaseAdmin()
    .from("longform_items")
    .select("category_label, youtube_url, published_at, created_at")
    .eq("video_status", "completed")
    .not("youtube_url", "is", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as { category_label: string; youtube_url: string; published_at: string | null; created_at: string }[])
    .map((r) => ({ ...r, id: idOf(r.youtube_url) }))
    .filter((r): r is typeof r & { id: string } => !!r.id);
  console.log(`① 완료된 롱폼: ${rows.length}편`);
  if (!rows.length) return;

  // 누적 조회·좋아요·댓글 (Data API, 50개씩)
  const stats = new Map<string, { views: number; likes: number; comments: number; title: string; duration: string }>();
  for (let i = 0; i < rows.length; i += 50) {
    const ids = rows.slice(i, i + 50).map((r) => r.id);
    const res = await yt.videos.list({ id: ids, part: ["statistics", "snippet", "contentDetails"], maxResults: 50 });
    for (const v of res.data.items ?? []) {
      stats.set(v.id!, {
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        title: v.snippet?.title ?? "",
        duration: v.contentDetails?.duration ?? "",
      });
    }
  }
  const now = Date.now();
  const table = rows.map((r) => {
    const s = stats.get(r.id);
    const ageDays = Math.max(1, Math.round((now - Date.parse(r.published_at ?? r.created_at)) / 86_400_000));
    return { ...r, views: s?.views ?? 0, likes: s?.likes ?? 0, comments: s?.comments ?? 0, title: s?.title ?? "(조회 불가)", ageDays };
  });
  const views = table.map((t) => t.views);
  const perMonth = table.map((t) => Math.round((t.views / t.ageDays) * 30));
  console.log(`  누적 조회 합계 ${views.reduce((a, b) => a + b, 0)} · 편당 중앙값 ${median(views)} · 최고 ${Math.max(...views)}`);
  console.log(`  월 환산(조회÷게시일수×30) 중앙값 ${median(perMonth)} · 최고 ${Math.max(...perMonth)}`);
  console.log(`  좋아요 합계 ${table.reduce((a, t) => a + t.likes, 0)} · 댓글 합계 ${table.reduce((a, t) => a + t.comments, 0)}`);

  console.log("\n② 편별 (조회 순) - 조회 · 게시 후 일수 · 월 환산 · 주제 · 제목");
  for (const t of [...table].sort((a, b) => b.views - a.views)) {
    const pm = Math.round((t.views / t.ageDays) * 30);
    console.log(`  ${String(t.views).padStart(5)} · ${String(t.ageDays).padStart(3)}일 · 월${String(pm).padStart(4)} · ${t.category_label} · ${t.title.slice(0, 40)}`);
  }

  // 유입 경로 (Analytics API). 롱폼 영상만 필터 - 최대 200개씩.
  const day = (n: number) => new Date(now - n * 86_400_000).toISOString().slice(0, 10);
  const start = rows.map((r) => (r.published_at ?? r.created_at).slice(0, 10)).sort()[0] ?? day(60);
  try {
    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate: start,
      endDate: day(0),
      dimensions: "insightTrafficSourceType",
      metrics: "views,estimatedMinutesWatched",
      filters: `video==${rows.slice(0, 200).map((r) => r.id).join(",")}`,
      sort: "-views",
    });
    const tr = (res.data.rows ?? []) as (string | number)[][];
    const total = tr.reduce((a, r) => a + Number(r[1]), 0);
    console.log(`\n③ 롱폼 유입 경로 (${start} ~ ${day(0)}, 조회 ${total})`);
    for (const r of tr) {
      const pct = total ? ((Number(r[1]) / total) * 100).toFixed(1) : "-";
      console.log(`  ${String(r[0]).padEnd(22)} ${String(r[1]).padStart(6)} (${pct}%) · 시청 ${r[2]}분`);
    }
    console.log("  (YT_SEARCH = 유튜브 검색, SUGGESTED = 추천 영상 옆, BROWSE = 홈·구독, EXT_URL = 외부 링크)");
  } catch (e) {
    console.log(`\n③ 유입 경로 읽기 실패: ${(e as Error).message.slice(0, 160)}`);
  }

  // 검색어 (YT_SEARCH 상위 검색어) - 있으면 선반 주제 고르는 데 쓴다
  try {
    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate: start,
      endDate: day(0),
      dimensions: "insightTrafficSourceDetail",
      metrics: "views",
      filters: `video==${rows.slice(0, 200).map((r) => r.id).join(",")};insightTrafficSourceType==YT_SEARCH`,
      sort: "-views",
      maxResults: 15,
    });
    const tr = (res.data.rows ?? []) as (string | number)[][];
    console.log(`\n④ 롱폼으로 들어온 유튜브 검색어 상위 ${tr.length}개`);
    for (const r of tr) console.log(`  ${String(r[1]).padStart(5)}  ${r[0]}`);
    if (!tr.length) console.log("  (없음 - 유튜브 검색으로 들어온 조회가 사실상 없다)");
  } catch (e) {
    console.log(`\n④ 검색어 읽기 실패: ${(e as Error).message.slice(0, 160)}`);
  }

  // 판정 힌트 (전략 문서 시험 A 기준)
  const med = median(perMonth);
  console.log("\n⑤ 선반(검색 롱폼) 가정 점검");
  console.log(`  기존 롱폼 월 환산 조회 중앙값 ${med}회 (전략 가정: 나쁨 15 · 기본 40 · 좋음 150)`);
  console.log(
    med < 20
      ? "  → 기본 가정(40)보다 낮다. 선반은 '시험 A'로만 남기고 그 위에 개발하지 않는다."
      : "  → 기본 가정 근처 이상. 시험 A 를 그대로 진행한다."
  );
}

main().catch((e) => {
  console.error("롱폼 리포트 실패:", (e as Error).message);
  process.exit(1);
});

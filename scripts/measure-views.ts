/** 유튜브 조회수/좋아요 실측 (videos.list statistics). 게시일 기준으로 개편 전/후 분리 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

const CUTOFF = "2026-07-26"; // 개편 배포일

async function main() {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_OAUTH_CLIENT_ID!,
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET!
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const yt = google.youtube({ version: "v3", auth: oauth2 });

  const { data: rows } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, youtube_url, created_at")
    .not("youtube_url", "is", null)
    .order("display_number");

  // youtube_url("https://youtu.be/XXXX" 또는 "...watch?v=XXXX") → 영상 ID
  const idOf = (url: string): string | null =>
    url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null;

  const items = ((rows ?? []) as { display_number: number; youtube_url: string; created_at: string }[])
    .map((r) => ({ ...r, youtube_video_id: idOf(r.youtube_url) }))
    .filter((r): r is typeof r & { youtube_video_id: string } => Boolean(r.youtube_video_id));
  console.log(`유튜브 ID 보유 영상: ${items.length}개`);
  if (items.length === 0) return;

  // videos.list 는 한 번에 50개 (쿼터 1유닛/호출)
  const stats = new Map<
    string,
    { views: number; likes: number; comments: number; pub: string; privacy: string }
  >();
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const res = await yt.videos.list({
      part: ["statistics", "snippet", "status"],
      id: chunk.map((c) => c.youtube_video_id),
      maxResults: 50,
    });
    for (const v of res.data.items ?? []) {
      stats.set(v.id!, {
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        pub: String(v.snippet?.publishedAt ?? ""),
        privacy: String(v.status?.privacyStatus ?? "?"),
      });
    }
  }

  const before: number[][] = [];
  const after: number[][] = [];
  const afterDetail: {
    n: number;
    v: number;
    l: number;
    pub: string;
    privacy: string;
  }[] = [];
  for (const it of items) {
    const s = stats.get(it.youtube_video_id);
    if (!s) continue;
    const day = (s.pub || it.created_at).slice(0, 10);
    (day >= CUTOFF ? after : before).push([s.views, s.likes, s.comments]);
    if (day >= CUTOFF) {
      afterDetail.push({
        n: it.display_number,
        v: s.views,
        l: s.likes,
        pub: day,
        privacy: s.privacy,
      });
    }
  }

  const sum = (a: number[][], i: number) => a.reduce((t, r) => t + r[i], 0);
  const show = (label: string, a: number[][]) => {
    if (a.length === 0) return console.log(`${label}: 없음`);
    const v = sum(a, 0), l = sum(a, 1), c = sum(a, 2);
    console.log(
      `${label}: ${a.length}개 · 조회 ${v.toLocaleString()} (평균 ${Math.round(v / a.length)})` +
        ` · 좋아요 ${l} (${((l / (v || 1)) * 100).toFixed(2)}%) · 댓글 ${c}`
    );
  };
  console.log(`\n기준일 ${CUTOFF}`);
  show("개편 전", before);
  show("개편 후", after);

  afterDetail.sort((a, b) => b.v - a.v);
  console.log("\n개편 후 조회수 상위 8개:");
  for (const d of afterDetail.slice(0, 8)) console.log(`  ${d.n}번  조회 ${d.v}  좋아요 ${d.l}`);
  // 조회수가 바닥인 영상은 "안 떴다"가 아니라 "비공개로 올라갔다"일 수 있다.
  // 발행된 지 사흘이 지났는데 조회 10 미만이면 공개 상태부터 의심한다.
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const stale = afterDetail.filter((d) => d.v < 10 && d.pub < threeDaysAgo);
  console.log(`\n사흘 넘었는데 조회 10 미만: ${stale.length}개`);
  for (const d of stale.slice(0, 20)) {
    console.log(`  ${d.n}번  조회 ${d.v}  게시 ${d.pub}  공개상태 ${d.privacy}`);
  }

  const byPrivacy = new Map<string, number>();
  for (const d of afterDetail) byPrivacy.set(d.privacy, (byPrivacy.get(d.privacy) ?? 0) + 1);
  console.log("공개상태별 편수:");
  for (const [k, n] of byPrivacy) console.log(`  ${k}: ${n}개`);
}
main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});

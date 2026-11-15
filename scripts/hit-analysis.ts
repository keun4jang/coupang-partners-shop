/**
 * 잘된 영상 vs 안된 영상 구조 비교 (읽기만) - 2026-11-15 사장님 "우리는 잘하고 있는지 체크하고 피드백하고 수정해"
 * (참고 글: "결과물이 아니라 그 결과를 만든 구조를 분석하라").
 * 10/19 이후 유튜브 영상(게시 3일 이상)의 게시 후 7일 지표를 모아 위·아래 묶음의 특징(형식·주제·제목·길이·
 * 끝까지 본 비율·게시 시각)을 나란히 본다. 호출: Supabase 읽기, YouTube Data(videos.list)·Analytics 읽기. 쓰기 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { google } from "googleapis";
import { supabaseAdmin } from "../src/lib/supabase";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";

type Row = {
  display_number: number;
  youtube_url: string | null;
  broll_origin: string | null;
  hook_text: string | null;
  published_at: string | null;
  products: { product_name: string; category: string | null } | null;
};
type Stat = {
  n: number;
  id: string;
  format: string;
  topic: string;
  title: string;
  product: string;
  sec: number;
  kstHour: number;
  views7: number;
  engaged: number;
  avgPct: number;
  avgDur: number;
};
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const vid = (u: string | null) => u?.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
const isoSec = (d: string) => {
  const m = d.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
};
const formatOf = (o: string) =>
  o.includes("[병맛]") ? "병맛" : o.includes("[드라마]") ? "드라마" : o.includes("꿀팁:") ? "꿀팁" : "상품";

async function main() {
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_OAUTH_CLIENT_ID!, process.env.YOUTUBE_OAUTH_CLIENT_SECRET!);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth2 });
  const yt = google.youtube({ version: "v3", auth: oauth2 });

  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, youtube_url, broll_origin, hook_text, published_at, products(product_name, category)")
    .gte("published_at", "2026-10-19T00:00:00Z")
    .not("youtube_url", "is", null);
  const now = Date.now();
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.published_at && now - Date.parse(r.published_at) >= 3 * 86_400_000);

  // 제목·길이 (50개씩)
  const meta = new Map<string, { title: string; sec: number; status: string }>();
  const ids = rows.map((r) => vid(r.youtube_url)).filter((x): x is string => !!x);
  for (let i = 0; i < ids.length; i += 50) {
    const res = await yt.videos.list({ part: ["snippet", "contentDetails", "status"], id: ids.slice(i, i + 50) });
    for (const v of res.data.items ?? [])
      meta.set(v.id!, {
        title: v.snippet?.title ?? "",
        sec: isoSec(v.contentDetails?.duration ?? ""),
        // 0회 영상이 실제로 공개 상태인지 (비공개·처리 실패·아동용·지역 제한이면 노출이 안 된다)
        status: [v.status?.privacyStatus, v.status?.uploadStatus, v.status?.rejectionReason, v.status?.madeForKids ? "아동용" : "", v.contentDetails?.regionRestriction ? "지역제한" : ""].filter(Boolean).join("/"),
      });
  }

  const stats: Stat[] = [];
  for (const r of rows) {
    const id = vid(r.youtube_url);
    if (!id) continue;
    const start = r.published_at!.slice(0, 10);
    const end = new Date(Math.min(now, Date.parse(r.published_at!) + 7 * 86_400_000)).toISOString().slice(0, 10);
    try {
      const res = await analytics.reports.query({
        ids: "channel==MINE",
        startDate: start,
        endDate: end,
        filters: `video==${id}`,
        metrics: "views,engagedViews,averageViewPercentage,averageViewDuration",
      });
      const row = ((res.data.rows ?? [])[0] ?? []) as number[];
      const o = r.broll_origin ?? "";
      const ti = o.lastIndexOf("꿀팁:");
      stats.push({
        n: r.display_number,
        id,
        format: formatOf(o),
        topic: ti >= 0 ? o.slice(ti + 3).trim() : "-",
        title: meta.get(id)?.title ?? "",
        product: (r.products?.product_name ?? "").slice(0, 24),
        sec: meta.get(id)?.sec ?? 0,
        kstHour: (new Date(r.published_at!).getUTCHours() + 9) % 24,
        views7: Number(row[0] ?? 0),
        engaged: Number(row[1] ?? 0),
        avgPct: Number(row[2] ?? 0),
        avgDur: Number(row[3] ?? 0),
      });
    } catch (e) {
      console.log(`  ${r.display_number}번 조회 실패: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  stats.sort((a, b) => b.views7 - a.views7);
  const line = (s: Stat) =>
    `[${meta.get(s.id)?.status ?? "목록에 없음"}] ${String(s.n).padStart(4)}번 ${s.format.padEnd(3)} 조회 ${String(s.views7).padStart(5)} · 유효 ${s.views7 ? Math.round((s.engaged / s.views7) * 100) : 0}% · 끝까지 ${Math.round(s.avgPct)}% · ${s.sec}초 · ${String(s.kstHour).padStart(2)}시 | ${s.title} | 주제 ${s.topic} | ${s.product}`;
  console.log(`── 10/19 이후 유튜브 ${stats.length}편 (게시 후 7일) ──`);
  console.log("\n[위 15편]");
  stats.slice(0, 15).forEach((s) => console.log(line(s)));
  console.log("\n[아래 15편]");
  stats.slice(-15).forEach((s) => console.log(line(s)));

  const band = (name: string, f: (s: Stat) => boolean) => {
    const g = stats.filter(f);
    const tv = g.reduce((a, b) => a + b.views7, 0);
    console.log(
      `${name.padEnd(14)} ${String(g.length).padStart(3)}편 · 조회 중앙값 ${median(g.map((x) => x.views7))} · 0~4회 ${g.filter((x) => x.views7 <= 4).length}편 · 유효 ${tv ? ((g.reduce((a, b) => a + b.engaged, 0) / tv) * 100).toFixed(1) : "-"}% · 끝까지 중앙값 ${median(g.map((x) => Math.round(x.avgPct)))}% · 길이 중앙값 ${median(g.map((x) => x.sec))}초`
    );
  };
  console.log("\n[묶음별]");
  for (const f of ["꿀팁", "드라마", "병맛", "상품"]) band(`형식 ${f}`, (s) => s.format === f);
  band("길이 ~30초", (s) => s.sec <= 30);
  band("길이 31~45초", (s) => s.sec > 30 && s.sec <= 45);
  band("길이 46초~", (s) => s.sec > 45);
  for (const [a, b] of [[6, 12], [12, 18], [18, 24], [0, 6]] as const) band(`게시 ${a}~${b}시`, (s) => s.kstHour >= a && s.kstHour < b);
  const top = stats.slice(0, Math.ceil(stats.length / 4));
  const bot = stats.slice(-Math.ceil(stats.length / 4));
  band("위 25%", (s) => top.includes(s));
  band("아래 25%", (s) => bot.includes(s));
  // 게시 날짜별 - 채널 전체가 어느 날부터 노출이 끊겼는지
  console.log("\n[게시일별 (KST) 조회 중앙값]");
  const byDay = new Map<string, Stat[]>();
  for (const s of stats) {
    const r = rows.find((x) => x.display_number === s.n)!;
    const d = new Date(Date.parse(r.published_at!) + 9 * 3_600_000).toISOString().slice(5, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(s);
  }
  [...byDay.entries()].sort().forEach(([d, g]) => console.log(`  ${d} ${g.length}편 · 중앙값 ${median(g.map((x) => x.views7))} · ${g.map((x) => `${x.n}:${x.views7}${x.format === "드라마" ? "드" : ""}`).join(" ")}`));
  // 같은 주제 몇 번째인가 (검수 꿀팁·드라마 대본은 주제당 한 벌이라 같은 주제 = 거의 같은 영상) - 중복 영상 억제 여부
  console.log("\n[같은 주제 몇 번째 영상인가 (꿀팁·드라마, 게시 순)]");
  const chron = [...stats].filter((s) => s.topic !== "-").sort((a, b) => {
    const pa = rows.find((x) => x.display_number === a.n)!.published_at!;
    const pb = rows.find((x) => x.display_number === b.n)!.published_at!;
    return Date.parse(pa) - Date.parse(pb);
  });
  // 10/19 이전에 쓴 주제도 세야 정확 - 10/19 이후만 본다는 한계는 로그에 적는다
  const seen = new Map<string, number>();
  const seenFmt = new Map<string, number>();
  const occ: Record<string, Stat[]> = {};
  const dupDrama: Stat[] = [];
  for (const s of chron) {
    const k = (seen.get(s.topic) ?? 0) + 1;
    seen.set(s.topic, k);
    (occ[k >= 3 ? "3번째+" : `${k}번째`] ??= []).push(s);
    const fk = `${s.format}|${s.topic}`;
    const fn = (seenFmt.get(fk) ?? 0) + 1;
    seenFmt.set(fk, fn);
    if (s.format === "드라마" && fn >= 2) dupDrama.push(s);
  }
  for (const k of ["1번째", "2번째", "3번째+"]) {
    const g = occ[k] ?? [];
    console.log(`  ${k}: ${g.length}편 · 조회 중앙값 ${median(g.map((x) => x.views7))} · 0~4회 ${g.filter((x) => x.views7 <= 4).length}편 · 100회+ ${g.filter((x) => x.views7 >= 100).length}편`);
  }
  console.log(`  같은 드라마 대본 두 번째 이상(완전히 같은 대화): ${dupDrama.map((x) => `${x.n}:${x.views7}`).join(" ") || "없음"}`);
  console.log("  (10/19 이후 게시분만 셈)");
  // 제목 첫머리 낱말 - 위/아래 비교
  const words = (g: Stat[]) => {
    const c = new Map<string, number>();
    for (const s of g) for (const w of new Set(s.title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((x) => x.length >= 2))) c.set(w, (c.get(w) ?? 0) + 1);
    return [...c.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([w, n]) => `${w}(${n})`).join(" ");
  };
  console.log(`\n[제목 낱말] 위 25%: ${words(top)}`);
  console.log(`[제목 낱말] 아래 25%: ${words(bot)}`);
  // 주제별 (2편 이상)
  const byTopic = new Map<string, number[]>();
  for (const s of stats) if (s.topic !== "-") (byTopic.get(s.topic) ?? byTopic.set(s.topic, []).get(s.topic)!).push(s.views7);
  console.log("\n[주제별 조회 중앙값, 2편 이상]");
  [...byTopic.entries()]
    .filter(([, v]) => v.length >= 2)
    .sort((a, b) => median(b[1]) - median(a[1]))
    .forEach(([t, v]) => console.log(`  ${t}: ${v.length}편 · 중앙값 ${median(v)} · ${v.join("/")}`));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

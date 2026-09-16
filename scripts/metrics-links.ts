/**
 * 링크 성과 리포트.
 *
 * "영상 → 랜딩 → 제휴 링크" 중 어디서 새는지 본다.
 *   방문(landing_view) 대비 링크 클릭(outbound_click) 비율 = CTR
 *
 * 실행:
 *   npm run metrics:links          # 최근 7일
 *   npm run metrics:links -- 14    # 최근 14일
 *
 * 주의: 시크릿 값은 출력하지 않는다. 숫자만 본다.
 */
import dotenv from "dotenv";
// quiet: dotenv v17 은 기본으로 홍보 배너를 찍는다. 로그를 그대로 Actions
// Summary 에 붙이는데 거기 섞이면 읽는 사람이 헷갈린다.
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { supabaseAdmin } from "../src/lib/supabase";

interface EventRow {
  event_date: string;
  display_number: number;
  event_type: "landing_view" | "outbound_click";
  source: string;
  channel: string;
  template_variant: string;
  rank_in_video: number;
  event_count: number;
}

/** 방문·클릭 한 쌍 */
interface Tally {
  views: number;
  clicks: number;
}

function emptyTally(): Tally {
  return { views: 0, clicks: 0 };
}

function add(map: Map<string, Tally>, key: string, row: EventRow): void {
  const t = map.get(key) ?? emptyTally();
  if (row.event_type === "landing_view") t.views += row.event_count;
  else t.clicks += row.event_count;
  map.set(key, t);
}

/** CTR 문자열. 방문이 0이면 비율을 낼 수 없다(0%가 아니라 "-"다) */
function ctr(t: Tally): string {
  if (t.views === 0) return t.clicks > 0 ? "방문기록없음" : "-";
  return `${((t.clicks / t.views) * 100).toFixed(1)}%`;
}

function printTable(
  title: string,
  map: Map<string, Tally>,
  opts: { limit?: number; label: string }
): void {
  console.log(`\n── ${title} ──`);
  const rows = [...map.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].views - a[1].views);
  if (rows.length === 0) {
    console.log("  아직 데이터 없음");
    return;
  }
  console.log(`  ${opts.label.padEnd(22)} ${"방문".padStart(7)} ${"클릭".padStart(7)} ${"CTR".padStart(9)}`);
  for (const [key, t] of rows.slice(0, opts.limit ?? rows.length)) {
    console.log(
      `  ${key.padEnd(22)} ${String(t.views).padStart(7)} ${String(t.clicks).padStart(7)} ${ctr(t).padStart(9)}`
    );
  }
  if (opts.limit && rows.length > opts.limit) {
    console.log(`  … 외 ${rows.length - opts.limit}건`);
  }
}

async function main(): Promise<void> {
  const days = Number.parseInt(process.argv[2] ?? "7", 10);
  const windowDays = Number.isFinite(days) && days > 0 && days <= 90 ? days : 7;

  const since = new Date(Date.now() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  console.log(`=== 링크 성과 리포트 (최근 ${windowDays}일, ${since} 이후) ===`);

  // 사장님이 텔레그램에서 "클릭률"을 쳤을 때 보는 것과 같은 문구를 먼저 찍는다.
  // 여기 숫자와 텔레그램 숫자가 다르면 그 자체가 문제 신호다.
  const { buildCtrReport, formatCtrMessage } = await import("../src/lib/report");
  console.log("\n── 텔레그램 '클릭률' 과 같은 요약 ──");
  console.log(formatCtrMessage(await buildCtrReport(windowDays)));

  const { data, error } = await supabaseAdmin()
    .from("product_event_daily")
    .select("*")
    .gte("event_date", since)
    .limit(10_000);

  if (error) {
    // 마이그레이션 전이면 테이블이 없다 - 오류로 죽지 말고 무엇을 해야 하는지 알린다
    console.log("\n집계 테이블을 읽지 못했습니다.");
    console.log(`사유: ${error.message.slice(0, 200)}`);
    console.log(
      "\nsupabase/migrations/20260906_product_event_daily.sql 을 아직 적용하지 않았다면,"
    );
    console.log("Supabase SQL Editor 에 붙여넣어 실행한 뒤 다시 돌려주세요.");
    return;
  }

  // 배열이 아닐 수도 있다(권한 문제로 오류 객체가 오는 경우 등).
  // 리포트가 죽는 것보다 "아직 없다"고 말해 주는 편이 낫다.
  const rows: EventRow[] = Array.isArray(data) ? (data as EventRow[]) : [];
  if (rows.length === 0) {
    console.log("\n아직 데이터 없음 - 집계가 쌓이려면 새 영상이 발행되고");
    console.log("시청자가 N번 페이지에 들어와야 합니다.");
    return;
  }

  const total = emptyTally();
  const byNumber = new Map<string, Tally>();
  const byVariant = new Map<string, Tally>();
  const bySource = new Map<string, Tally>();
  const byRank = new Map<string, Tally>();

  for (const row of rows) {
    if (row.event_type === "landing_view") total.views += row.event_count;
    else total.clicks += row.event_count;

    add(byNumber, `${row.display_number}번`, row);
    add(byVariant, row.template_variant || "(미기록)", row);
    add(bySource, row.source, row);
    if (row.rank_in_video > 0) add(byRank, `TOP10 ${row.rank_in_video}위`, row);
  }

  console.log(
    `\n전체: 방문 ${total.views} · 링크 클릭 ${total.clicks} · CTR ${ctr(total)}`
  );

  printTable("템플릿 변형별 (classic vs usecase)", byVariant, { label: "변형" });
  printTable("유입 경로별", bySource, { label: "경로" });
  printTable("번호별 상위 20", byNumber, { label: "번호", limit: 20 });
  if (byRank.size > 0) {
    printTable("롱폼 순위별", byRank, { label: "순위" });
  }

  console.log(
    "\n※ CTR = 링크 클릭 ÷ N번 페이지 방문. 영상 조회수 대비 비율이 아닙니다."
  );

  // 날짜별 추이. 합계만 보면 "봇이 매일 오는지, 하루 몰아쳤는지"를 구분할 수
  // 없다 - 2026-09-13 에 롱폼 직행 이동이 7일 합 230건인데 쿠팡 공식은 한 달
  // 25클릭이라 열 배가 벌어졌고, 그게 매일 오는 트래픽인지 며칠 전 한 번의
  // 몰아치기인지가 판단을 갈랐다. 그래서 날짜를 쪼개 본다.
  printLongformByDate(rows);
  await printBlockedByDate(since);
}

/** 롱폼 직행 이동(랜딩 없이 /go 로 바로) 날짜별 추이 */
function printLongformByDate(rows: EventRow[]): void {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.source !== "youtube_longform" || r.event_type !== "outbound_click") continue;
    byDate.set(r.event_date, (byDate.get(r.event_date) ?? 0) + r.event_count);
  }
  console.log("\n── 롱폼 직행 이동 (날짜별) ──");
  if (byDate.size === 0) {
    console.log("  없음");
    return;
  }
  let total = 0;
  for (const [date, n] of [...byDate.entries()].sort()) {
    total += n;
    console.log(`  ${date}  ${String(n).padStart(6)}`);
  }
  console.log(`  합계    ${String(total).padStart(6)}`);
}

/** 봇 필터가 빼낸 요청의 날짜별·사유별 추이 (blocked_outbound_daily) */
async function printBlockedByDate(since: string): Promise<void> {
  console.log("\n── 자동요청 제외 (날짜별) ──");
  const { data, error } = await supabaseAdmin()
    .from("blocked_outbound_daily")
    .select("event_date, reason, event_count")
    .gte("event_date", since)
    .limit(10_000);
  if (error) {
    // 2026-09-14 마이그레이션 전이면 테이블이 없다. 리포트를 죽이지는 않는다.
    console.log(`  읽지 못했습니다: ${error.message.slice(0, 120)}`);
    return;
  }
  const rows = (data ?? []) as Array<{
    event_date: string;
    reason: string;
    event_count: number;
  }>;
  if (rows.length === 0) {
    console.log("  없음 (필터에 걸린 요청이 아직 없습니다)");
    return;
  }
  const byDate = new Map<string, number>();
  const byReason = new Map<string, number>();
  for (const r of rows) {
    byDate.set(r.event_date, (byDate.get(r.event_date) ?? 0) + r.event_count);
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.event_count);
  }
  for (const [date, n] of [...byDate.entries()].sort()) {
    console.log(`  ${date}  ${String(n).padStart(6)}`);
  }
  console.log("  사유별:");
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(24)} ${String(n).padStart(6)}`);
  }
}

main().catch((e) => {
  console.error("리포트 실패:", (e as Error).message);
  process.exit(1);
});

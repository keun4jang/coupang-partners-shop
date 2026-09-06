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
dotenv.config({ path: ".env.local" });
dotenv.config();

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
}

main().catch((e) => {
  console.error("리포트 실패:", (e as Error).message);
  process.exit(1);
});

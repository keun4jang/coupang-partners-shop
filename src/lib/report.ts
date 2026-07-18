import { supabaseAdmin } from "./supabase";
import { dateFolderName } from "./format";

/**
 * 매니저 - 성과 리포트.
 * click_logs 를 집계해 "오늘/이번주 클릭"과 "인기 번호"를 텔레그램용 텍스트로 만든다.
 * 클릭량이 적은 서비스라 행을 그대로 받아 JS 에서 집계한다.
 */

export interface ReportData {
  dateKst: string;
  todayClicks: number;
  weekClicks: number;
  topNumbers: Array<{ display_number: number; count: number; name: string }>;
  candidateCount: number;
  visibleVideos: number;
  totalVideos: number;
}

/** KST 기준 오늘 0시를 UTC ISO 로 */
function kstTodayStartIso(): string {
  return new Date(`${dateFolderName()}T00:00:00+09:00`).toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function buildReportData(): Promise<ReportData> {
  const db = supabaseAdmin();
  const todayStart = kstTodayStartIso();
  const weekStart = daysAgoIso(7);

  const [
    { count: todayClicks },
    { count: weekClicks },
    { data: weekRows },
    { count: candidateCount },
    { count: visibleVideos },
    { count: totalVideos },
  ] = await Promise.all([
    db.from("click_logs").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    db.from("click_logs").select("*", { count: "exact", head: true }).gte("created_at", weekStart),
    db.from("click_logs").select("display_number").gte("created_at", weekStart),
    db.from("products").select("*", { count: "exact", head: true }).eq("status", "candidate"),
    db.from("video_items").select("*", { count: "exact", head: true }).eq("landing_visible", true),
    db.from("video_items").select("*", { count: "exact", head: true }),
  ]);

  // 이번주 번호별 클릭수 집계 → 상위 5
  const counts = new Map<number, number>();
  for (const row of (weekRows as { display_number: number }[] | null) ?? []) {
    counts.set(row.display_number, (counts.get(row.display_number) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 상위 번호의 상품명 붙이기
  const nameByNumber = new Map<number, string>();
  if (top.length > 0) {
    const { data: items } = await db
      .from("video_items")
      .select("display_number, products(product_name)")
      .in(
        "display_number",
        top.map(([n]) => n)
      );
    for (const it of (items as
      | { display_number: number; products: { product_name: string } | null }[]
      | null) ?? []) {
      if (it.products?.product_name) nameByNumber.set(it.display_number, it.products.product_name);
    }
  }

  return {
    dateKst: dateFolderName(),
    todayClicks: todayClicks ?? 0,
    weekClicks: weekClicks ?? 0,
    topNumbers: top.map(([n, c]) => ({
      display_number: n,
      count: c,
      name: nameByNumber.get(n) ?? "(삭제된 상품)",
    })),
    candidateCount: candidateCount ?? 0,
    visibleVideos: visibleVideos ?? 0,
    totalVideos: totalVideos ?? 0,
  };
}

/** 현황(영상 개수)만. 수익은 별도 수익 메시지가 담당한다(사장님 요청 - 클릭수 제외). */
export function formatReportMessage(d: ReportData): string {
  return ["📦 현황", `· 노출중 영상: ${d.visibleVideos}개 / 전체 ${d.totalVideos}개`].join(
    "\n"
  );
}

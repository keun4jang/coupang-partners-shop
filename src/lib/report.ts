import { supabaseAdmin } from "./supabase";
import { dateFolderName } from "./format";

/**
 * 매니저 - 성과 리포트.
 * click_logs 를 집계해 "오늘/이번주 클릭"과 "인기 번호"를 텔레그램용 텍스트로 만든다.
 * 클릭량이 적은 서비스라 행을 그대로 받아 JS 에서 집계한다.
 *
 * 2026-09 클릭률 개선 2차: product_event_daily/profile_hub_view_daily 를
 * 곁들여 CTR%·소스별·템플릿별 성과를 자동으로 붙인다(예전엔 scripts/metrics-links.ts
 * 를 사람이 수동으로 돌려야만 볼 수 있었다). 두 테이블 모두 마이그레이션을
 * 아직 안 걸었으면 없을 수 있으므로, 읽기 실패는 리포트 전체를 막지 않고
 * 그 구간만 "집계 전"으로 비워 둔다.
 */

export interface ReportData {
  dateKst: string;
  todayClicks: number;
  weekClicks: number;
  topNumbers: Array<{ display_number: number; count: number; name: string }>;
  candidateCount: number;
  visibleVideos: number;
  totalVideos: number;
  ctr: CtrReport;
}

/** 방문·클릭 한 쌍 + CTR(%). 방문이 0이면 ctr 은 null(0%가 아니라 "낼 수 없음") */
export interface Tally {
  views: number;
  clicks: number;
  ctr: number | null;
}

export interface CtrReport {
  /** 집계 테이블(product_event_daily)을 못 읽었으면 false - 마이그레이션 미적용 등 */
  available: boolean;
  windowDays: number;
  hubViews: number;
  /** 랜딩(방문) 단계가 있는 소스만의 합계 - "전체 CTR"의 분모/분자로 의미 있는 값 */
  overall: Tally;
  bySource: Array<{ source: string; tally: Tally }>;
  byTemplate: Array<{ variant: string; tally: Tally }>;
  /** 랜딩 없이 바로 나가는 소스(롱폼 등)의 이동 건수 - overall 에는 안 섞는다 */
  directOnlyClicks: number;
  /** 봇·미리보기로 보고 집계에서 뺀 이동 요청 (사유 분류별, 많은 순) */
  blocked: Array<{ group: string; count: number }>;
  blockedTotal: number;
}

interface ProductEventRow {
  event_type: "landing_view" | "outbound_click";
  source: string;
  template_variant: string;
  event_count: number;
}

function emptyTally(): Tally {
  return { views: 0, clicks: 0, ctr: null };
}

function addToTally(tally: Tally, row: ProductEventRow): void {
  if (row.event_type === "landing_view") tally.views += row.event_count;
  else tally.clicks += row.event_count;
}

function finalizeTally(tally: Tally): Tally {
  return { ...tally, ctr: tally.views > 0 ? (tally.clicks / tally.views) * 100 : null };
}

const SOURCE_LABEL: Record<string, string> = {
  youtube_shorts: "유튜브 쇼츠",
  instagram_reels: "인스타 릴스",
  youtube_longform: "유튜브 롱폼",
  facebook_reels: "페이스북",
  site: "사이트 직접",
  unknown: "미상",
};

/**
 * 랜딩(/n/[번호]) 없이 설명란에서 /go/[번호]로 바로 나가는 소스.
 * 이 소스는 landing_view 개념이 아예 없어서(방문 집계를 안 한다) outbound_click
 * 을 "방문 대비 이동" 전체 합계에 섞으면 방문보다 이동이 훨씬 많은 CTR
 * 1000% 같은 값이 나온다(2026-09-13 실측). overall 에는 넣지 않고 따로 센다.
 */
const DIRECT_ONLY_SOURCES = new Set<string>(["youtube_longform"]);

/**
 * 제외 사유는 'ua:googlebot' 처럼 세분화돼 쌓인다(수십 종). 텔레그램에서
 * 한눈에 보려면 앞머리 기준으로 묶는 편이 낫다 - 어떤 봇인지보다 "봇이라
 * 뺐다"가 알고 싶은 정보이므로.
 */
const BLOCK_GROUP_LABEL: Record<string, string> = {
  ua: "크롤러·봇",
  prefetch: "브라우저 미리읽기",
  method: "링크 검사",
  repeat: "짧은 시간 중복",
};

function blockGroupOf(reason: string): string {
  const prefix = reason.split(":")[0];
  return BLOCK_GROUP_LABEL[prefix] ?? prefix;
}

/** 최근 windowDays 일의 CTR 리포트. 집계 테이블이 없으면 available:false 로 조용히 비운다. */
export async function buildCtrReport(windowDays: number): Promise<CtrReport> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const db = supabaseAdmin();

  const empty: CtrReport = {
    available: false,
    windowDays,
    hubViews: 0,
    overall: emptyTally(),
    bySource: [],
    byTemplate: [],
    directOnlyClicks: 0,
    blocked: [],
    blockedTotal: 0,
  };

  const { data, error } = await db
    .from("product_event_daily")
    .select("event_type, source, template_variant, event_count")
    .gte("event_date", since)
    .limit(10_000);

  if (error || !data) return empty;

  const rows = data as ProductEventRow[];
  const overall = emptyTally();
  const bySource = new Map<string, Tally>();
  const byTemplate = new Map<string, Tally>();
  let directOnlyClicks = 0;

  for (const row of rows) {
    if (DIRECT_ONLY_SOURCES.has(row.source)) {
      if (row.event_type === "outbound_click") directOnlyClicks += row.event_count;
    } else {
      addToTally(overall, row);
    }

    const sourceTally = bySource.get(row.source) ?? emptyTally();
    addToTally(sourceTally, row);
    bySource.set(row.source, sourceTally);

    if (row.template_variant === "classic" || row.template_variant === "usecase") {
      const variantTally = byTemplate.get(row.template_variant) ?? emptyTally();
      addToTally(variantTally, row);
      byTemplate.set(row.template_variant, variantTally);
    }
  }

  // 허브 방문수는 별도 테이블 - 실패해도 CTR 리포트 자체는 살린다
  let hubViews = 0;
  try {
    const { data: hubRows } = await db
      .from("profile_hub_view_daily")
      .select("view_count")
      .gte("event_date", since)
      .limit(10_000);
    hubViews = ((hubRows as { view_count: number }[] | null) ?? []).reduce(
      (sum, r) => sum + r.view_count,
      0
    );
  } catch {
    // 마이그레이션 전이면 0으로 둔다
  }

  // 봇 필터가 걸러낸 건수도 별도 테이블 - 마찬가지로 실패해도 리포트는 살린다
  const blockedByGroup = new Map<string, number>();
  try {
    const { data: blockedRows } = await db
      .from("blocked_outbound_daily")
      .select("reason, event_count")
      .gte("event_date", since)
      .limit(10_000);
    for (const r of (blockedRows as { reason: string; event_count: number }[] | null) ?? []) {
      const group = blockGroupOf(r.reason);
      blockedByGroup.set(group, (blockedByGroup.get(group) ?? 0) + r.event_count);
    }
  } catch {
    // 마이그레이션 전이면 비워 둔다
  }

  return {
    available: true,
    windowDays,
    hubViews,
    overall: finalizeTally(overall),
    bySource: [...bySource.entries()]
      .map(([source, tally]) => ({ source, tally: finalizeTally(tally) }))
      .sort((a, b) => b.tally.clicks - a.tally.clicks),
    byTemplate: [...byTemplate.entries()]
      .map(([variant, tally]) => ({ variant, tally: finalizeTally(tally) }))
      .sort((a, b) => b.tally.clicks - a.tally.clicks),
    directOnlyClicks,
    blocked: [...blockedByGroup.entries()]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count),
    blockedTotal: [...blockedByGroup.values()].reduce((sum, n) => sum + n, 0),
  };
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
    ctr,
  ] = await Promise.all([
    db.from("click_logs").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    db.from("click_logs").select("*", { count: "exact", head: true }).gte("created_at", weekStart),
    db.from("click_logs").select("display_number").gte("created_at", weekStart),
    db.from("products").select("*", { count: "exact", head: true }).eq("status", "candidate"),
    db.from("video_items").select("*", { count: "exact", head: true }).eq("landing_visible", true),
    db.from("video_items").select("*", { count: "exact", head: true }),
    buildCtrReport(7),
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
    ctr,
  };
}

/** 현황(영상 개수)만. 수익은 별도 수익 메시지가 담당한다(사장님 요청 - 클릭수 제외). */
export function formatReportMessage(d: ReportData): string {
  return ["📦 현황", `· 노출중 영상: ${d.visibleVideos}개 / 전체 ${d.totalVideos}개`].join(
    "\n"
  );
}

function formatTally(t: Tally): string {
  const ctrText = t.ctr === null ? "-" : `${t.ctr.toFixed(1)}%`;
  return `방문 ${t.views} · 이동 ${t.clicks} (${ctrText})`;
}

/**
 * CTR 성과 메시지 - 매일 자동으로 나가는 formatReportMessage 와 달리, 텔레그램
 * "클릭률" 명령으로 물어봤을 때만 만든다(사장님이 자동 리포트에서 클릭수를
 * 빼 달라고 한 것과는 다른 요청이라 별도 명령으로 뒀다).
 */
export function formatCtrMessage(ctr: CtrReport): string {
  if (!ctr.available) {
    return [
      "📈 클릭 성과",
      "",
      "아직 집계할 데이터가 없어요.",
      "supabase/migrations/20260906_product_event_daily.sql 을",
      "Supabase SQL Editor 에 적용했는지 확인해 주세요.",
    ].join("\n");
  }

  const lines = [
    `📈 클릭 성과 (최근 ${ctr.windowDays}일)`,
    "",
    // 롱폼(설명란 직행 링크)은 방문 단계가 없어 여기 안 섞는다 - 섞으면
    // "방문 23 · 이동 230" 같은 CTR 1000%짜리 무의미한 숫자가 나온다.
    `전체(랜딩형): ${formatTally(ctr.overall)}`,
  ];
  if (ctr.directOnlyClicks > 0) {
    lines.push(`롱폼 직행 이동: ${ctr.directOnlyClicks}건 (설명란에서 바로 이동 - 방문 집계 없음)`);
  }
  lines.push(`프로필 허브 방문: ${ctr.hubViews}`);

  // 걸러낸 양을 같이 보여 준다. 이 줄이 없으면 "우리 숫자와 쿠팡 공식
  // 클릭수가 왜 다른가"를 다시 처음부터 따져 봐야 한다(2026-09-13 에 실제로
  // 열 배 차이가 나서 원인을 찾느라 한참 걸렸다).
  if (ctr.blockedTotal > 0) {
    const detail = ctr.blocked.map((b) => `${b.group} ${b.count}`).join(", ");
    lines.push(`자동요청 제외: ${ctr.blockedTotal}건 (${detail})`);
  }

  if (ctr.bySource.length > 0) {
    lines.push("", "[유입경로별]");
    for (const { source, tally } of ctr.bySource) {
      lines.push(`${SOURCE_LABEL[source] ?? source}: ${formatTally(tally)}`);
    }
  }

  if (ctr.byTemplate.length > 0) {
    lines.push("", "[템플릿 A/B]");
    for (const { variant, tally } of ctr.byTemplate) {
      lines.push(`${variant}: ${formatTally(tally)}`);
    }
  }

  return lines.join("\n");
}

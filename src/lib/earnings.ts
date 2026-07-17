import { fetchCommissionReport } from "./coupang";
import { optionalEnv } from "./env";

/**
 * 쿠팡파트너스 수익 요약 (오늘 / 최근 7일 / 이번달).
 * 커미션 리포트를 한 번 조회해 KST 날짜 기준으로 버킷 합산한다.
 * 실패해도 throw 하지 않고 ok:false 로 돌려줘 화면/텔레그램이 계속 동작한다.
 */

export interface EarningsBucket {
  commission: number;
  clicks: number;
}
export interface EarningsSummary {
  today: EarningsBucket;
  week: EarningsBucket; // 최근 7일(오늘 포함)
  month: EarningsBucket; // 이번달 1일~오늘
  monthLabel: string; // "2026-07"
  ok: boolean;
  error?: string;
}

/** 현재 시각을 KST 로 보정(UTC 필드로 KST 값을 읽기 위함) */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
const pad = (n: number) => String(n).padStart(2, "0");
/** KST 로 보정된 Date 의 날짜를 yyyyMMdd 로 */
function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function emptyBucket(): EarningsBucket {
  return { commission: 0, clicks: 0 };
}

export async function getEarnings(): Promise<EarningsSummary> {
  const now = kstNow();
  const monthLabel = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const base: EarningsSummary = {
    today: emptyBucket(),
    week: emptyBucket(),
    month: emptyBucket(),
    monthLabel,
    ok: false,
  };

  if (!optionalEnv("COUPANG_ACCESS_KEY") || !optionalEnv("COUPANG_SECRET_KEY")) {
    return { ...base, error: "쿠팡 API 키 미설정" };
  }

  const todayStr = yyyymmdd(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStart = new Date(now.getTime() - 6 * 86400000);
  // 조회 시작 = 이번달 1일과 7일 전 중 이른 날 (주간이 지난달로 넘어가는 경우 커버)
  const fetchStart = monthStart.getTime() < weekStart.getTime() ? monthStart : weekStart;

  try {
    const rows = await fetchCommissionReport(yyyymmdd(fetchStart), todayStr);
    const monthStartStr = yyyymmdd(monthStart);
    const weekStartStr = yyyymmdd(weekStart);
    const today = emptyBucket();
    const week = emptyBucket();
    const month = emptyBucket();
    // yyyyMMdd 문자열은 사전순 == 시간순이라 그대로 비교 가능
    for (const r of rows) {
      if (r.date >= monthStartStr) {
        month.commission += r.commission;
        month.clicks += r.click;
      }
      if (r.date >= weekStartStr) {
        week.commission += r.commission;
        week.clicks += r.click;
      }
      if (r.date === todayStr) {
        today.commission += r.commission;
        today.clicks += r.click;
      }
    }
    return { today, week, month, monthLabel, ok: true };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 원 표기 (반올림) */
export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 텔레그램용 수익 메시지 */
export function formatEarningsMessage(e: EarningsSummary): string {
  if (!e.ok) {
    return `💰 쿠팡파트너스 수익\n조회 실패: ${e.error ?? "알 수 없음"}`;
  }
  return [
    "💰 쿠팡파트너스 수익",
    `· 오늘: ${won(e.today.commission)} (클릭 ${e.today.clicks})`,
    `· 최근 7일: ${won(e.week.commission)} (클릭 ${e.week.clicks})`,
    `· 이번달(${e.monthLabel}): ${won(e.month.commission)} (클릭 ${e.month.clicks})`,
    "",
    "※ 커미션은 정산 확정 전 예상치예요.",
  ].join("\n");
}

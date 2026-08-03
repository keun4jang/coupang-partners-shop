import { fetchCommissionReport } from "./coupang";
import { optionalEnv } from "./env";
import { getSetting, setSetting } from "./settings";

/**
 * 쿠팡파트너스 지급(출금) 현황 계산.
 *
 * 쿠팡파트너스 지급 규칙:
 *  - 최소 지급액 10,000원. 월 마감 시 이 금액을 못 넘으면 다음 달로 이월된다.
 *  - 지급일은 수익 발생월 기준 "다다음 달 15일" (예: 8월 수익 → 10월 15일).
 *  - 별도 출금 신청 절차는 없고 등록된 계좌로 자동 입금된다.
 *    (그래서 이 모듈은 "언제 얼마가 들어오는지"를 알려주는 용도다)
 *
 * 커미션 리포트 API 는 한 번에 30일까지만 조회되므로 월 단위로 나눠 부른다.
 * 이미 지난 달(2개월 전 이전)은 값이 거의 확정이라 app_settings 에 캐싱해
 * 대시보드를 열 때마다 API 를 여러 번 때리지 않게 한다.
 */

/** 최소 지급 기준액 (원) */
export const PAYOUT_THRESHOLD = 10000;
/** 지급까지 걸리는 개월 수 (발생월 + 2개월 15일) */
const PAYOUT_DELAY_MONTHS = 2;
/** 이월 누적을 따라가기 위해 거슬러 볼 개월 수 */
const LOOKBACK_MONTHS = 6;

export interface MonthEarning {
  /** "202608" */
  month: string;
  commission: number;
}

export interface PayoutStatus {
  ok: boolean;
  error?: string;
  threshold: number;
  /** 아직 지급되지 않은 누적액(이월분 + 이번달 발생분) */
  unpaidBalance: number;
  /** 기준까지 남은 금액 (달성했으면 0) */
  shortfall: number;
  /** 이번달 마감 시 지급 대상이 되는지 */
  reachedThreshold: boolean;
  /** 지급 예정일 "2026-10-15" (기준 미달이면 null - 다음 달로 이월) */
  expectedPayoutDate: string | null;
  /** 이번달 "202608" */
  currentMonth: string;
  monthly: MonthEarning[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 현재 시각을 KST 로 보정(UTC 필드로 KST 값을 읽기 위함) */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

/** "202608" → 그 달의 [시작 yyyyMMdd, 끝 yyyyMMdd] (이번달이면 끝은 오늘) */
function monthRange(month: string, today: Date): [string, string] {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(4, 6));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayStr = `${today.getUTCFullYear()}${pad(today.getUTCMonth() + 1)}${pad(today.getUTCDate())}`;
  const end = `${month}${pad(lastDay)}`;
  return [`${month}01`, end > todayStr ? todayStr : end];
}

/** 최근 N개월 "yyyyMM" 오름차순 */
function recentMonths(today: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
}

/** 발생월 "202608" → 지급 예정일 "2026-10-15" */
export function payoutDateFor(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(4, 6));
  const d = new Date(Date.UTC(y, m - 1 + PAYOUT_DELAY_MONTHS, 15));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-15`;
}

/** 월 커미션 합계 (2개월 전 이전은 캐시 사용 - 값이 사실상 확정이라) */
async function monthCommission(
  month: string,
  today: Date,
  cacheable: boolean
): Promise<number> {
  const cacheKey = `coupang_commission_${month}`;
  if (cacheable) {
    const cached = await getSetting(cacheKey);
    if (cached !== null) {
      const n = Number(cached);
      if (Number.isFinite(n)) return n;
    }
  }
  const [start, end] = monthRange(month, today);
  const rows = await fetchCommissionReport(start, end);
  const sum = rows.reduce((a, r) => a + r.commission, 0);
  if (cacheable) await setSetting(cacheKey, String(sum));
  return sum;
}

export async function getPayoutStatus(): Promise<PayoutStatus> {
  const today = kstNow();
  const months = recentMonths(today, LOOKBACK_MONTHS);
  const currentMonth = months[months.length - 1];
  const base: PayoutStatus = {
    ok: false,
    threshold: PAYOUT_THRESHOLD,
    unpaidBalance: 0,
    shortfall: PAYOUT_THRESHOLD,
    reachedThreshold: false,
    expectedPayoutDate: null,
    currentMonth,
    monthly: [],
  };

  if (!optionalEnv("COUPANG_ACCESS_KEY") || !optionalEnv("COUPANG_SECRET_KEY")) {
    return { ...base, error: "쿠팡 API 키 미설정" };
  }

  try {
    const monthly: MonthEarning[] = [];
    for (const month of months) {
      // 이번달·지난달은 아직 변동 가능하므로 매번 새로 조회
      const cacheable = month < months[months.length - 2];
      monthly.push({ month, commission: await monthCommission(month, today, cacheable) });
    }

    // 이월 시뮬레이션: 마감된 달에 기준을 넘으면 지급되고 잔액은 0으로 리셋
    let balance = 0;
    for (const { month, commission } of monthly) {
      balance += commission;
      const closed = month !== currentMonth;
      if (closed && balance >= PAYOUT_THRESHOLD) balance = 0;
    }

    const reached = balance >= PAYOUT_THRESHOLD;
    return {
      ok: true,
      threshold: PAYOUT_THRESHOLD,
      unpaidBalance: balance,
      shortfall: Math.max(0, PAYOUT_THRESHOLD - balance),
      reachedThreshold: reached,
      expectedPayoutDate: reached ? payoutDateFor(currentMonth) : null,
      currentMonth,
      monthly,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 원 표기 (반올림) */
function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 텔레그램/리포트용 출금 현황 한 덩어리 */
export function formatPayoutMessage(p: PayoutStatus): string {
  if (!p.ok) return `🏦 출금 현황\n조회 실패: ${p.error ?? "알 수 없음"}`;
  if (p.reachedThreshold) {
    return [
      "🏦 출금 현황",
      `· 미지급 누적: ${won(p.unpaidBalance)} (기준 ${won(p.threshold)} 달성)`,
      `· 지급 예정일: ${p.expectedPayoutDate} (등록 계좌로 자동 입금)`,
      "※ 별도 출금 신청은 필요 없어요. 원천징수 3.3% 차감 후 입금돼요.",
    ].join("\n");
  }
  return [
    "🏦 출금 현황",
    `· 미지급 누적: ${won(p.unpaidBalance)} / 기준 ${won(p.threshold)}`,
    `· ${won(p.shortfall)} 더 모이면 지급 대상이에요 (미달 시 다음 달로 이월)`,
  ].join("\n");
}

/**
 * 이번달에 지급 기준을 처음 넘었을 때만 true (알림 1회용).
 * 같은 달에 중복 알림이 가지 않도록 app_settings 에 기록한다.
 */
export async function shouldAlertPayoutReached(p: PayoutStatus): Promise<boolean> {
  if (!p.ok || !p.reachedThreshold) return false;
  const key = `payout_alerted_${p.currentMonth}`;
  if ((await getSetting(key)) === "1") return false;
  await setSetting(key, "1");
  return true;
}

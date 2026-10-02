/**
 * 쿠팡 API 호출 장부 (2026-10-03).
 *
 * 쿠팡 API 시간당 한도 위반이 이미 3회 중 2회다(커밋 e1a165e·a9f0856). 3번째는
 * 파트너스 이용 제한이고 되돌릴 수 없다. 위반은 403 이 오기 전에, 한도를 처음
 * 넘는 호출에서 기록되므로 오류를 보고 멈추는 건 늦다.
 *
 * 그래서 모든 쿠팡 호출은 src/lib/coupang.ts 의 request() 한 곳을 지나고, 거기서
 * 호출 직전에 이 장부로부터 자리를 받는다:
 *  - 최근 60분 합계가 COUPANG_ROLLING_CAP(35, 한도 약 75의 절반 아래)이면 거절
 *  - 장부를 읽거나 쓸 수 없으면(SQL 적용 전, DB 장애) 거절 - 안전한 쪽으로
 * 거절은 CoupangLedgerRefusal 로 던진다. 호출한 쪽은 이것을 "한도 위반"과
 * 구분해야 한다(위반이 아니므로 차단 시각을 저장하거나 재시도하지 않고, 이번
 * 실행의 나머지 쿠팡 호출만 접는다).
 *
 * SQL: supabase/migrations/20261003_coupang_api_ledger.sql
 */
import { supabaseAdmin } from "./supabase";

export const COUPANG_ROLLING_CAP = 35;
/**
 * 리포트(커미션·수익 조회) 호출은 더 낮은 상한으로 받는다. 관리자 대시보드는 열 때마다
 * 리포트를 2~3번 부르는데, 같은 35칸을 쓰면 대시보드 몇 번에 스카우트(약 27회)가
 * 막힌다. 리포트는 최근 60분 합계가 20 미만일 때만 부를 수 있게 해 스카우트 몫을 남긴다.
 */
export const COUPANG_REPORT_CAP = 20;
export const LEDGER_REFUSAL_PREFIX = "쿠팡 API 장부";

export class CoupangLedgerRefusal extends Error {
  constructor(message: string) {
    super(`${LEDGER_REFUSAL_PREFIX}: ${message}`);
    this.name = "CoupangLedgerRefusal";
  }
}

export function isLedgerRefusal(e: unknown): boolean {
  return (
    e instanceof CoupangLedgerRefusal ||
    String((e as Error)?.message ?? "").startsWith(LEDGER_REFUSAL_PREFIX)
  );
}

function callSource(): string {
  if (process.env.GITHUB_WORKFLOW) return `gh:${process.env.GITHUB_WORKFLOW}`;
  if (process.env.VERCEL) return "vercel";
  return "local";
}

/** 호출 직전에 부른다. 자리를 못 받으면 CoupangLedgerRefusal 를 던진다. */
export async function acquireCoupangCall(path: string): Promise<number> {
  const cap = path.includes("/reports/") ? COUPANG_REPORT_CAP : COUPANG_ROLLING_CAP;
  let result: { data: unknown; error: { message: string } | null };
  try {
    result = await supabaseAdmin().rpc("coupang_api_acquire", {
      p_cap: cap,
      p_source: callSource(),
      p_path: path.split("?")[0].slice(0, 120),
    });
  } catch (e) {
    throw new CoupangLedgerRefusal(`장부 사용 불가 - 호출 중단 (${(e as Error).message.slice(0, 120)})`);
  }
  if (result.error) {
    throw new CoupangLedgerRefusal(
      `장부 사용 불가(SQL 적용 전?) - 호출 중단 (${result.error.message.slice(0, 120)})`
    );
  }
  const n = typeof result.data === "number" ? result.data : Number(result.data);
  if (!Number.isFinite(n) || n < 0) {
    throw new CoupangLedgerRefusal(`최근 60분 상한 ${cap}회 - 호출 중단`);
  }
  return n;
}

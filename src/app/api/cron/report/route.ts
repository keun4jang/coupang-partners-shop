import { NextRequest, NextResponse } from "next/server";
import { buildReportData, formatReportMessage } from "@/lib/report";
import { getEarnings, formatEarningsMessage } from "@/lib/earnings";
import {
  getPayoutStatus,
  formatPayoutMessage,
  markPayoutAlerted,
  shouldAlertPayoutReached,
} from "@/lib/payout";
import { sendTelegramMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 매일 저녁 성과 리포트 (Vercel Cron).
 * click_logs 를 집계해 오늘/이번주 클릭·인기 번호·현황을 텔레그램으로 보낸다.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const [data, earnings, payout] = await Promise.all([
      buildReportData(),
      getEarnings(),
      getPayoutStatus(),
    ]);
    await sendTelegramMessage(
      [
        `📊 살림템 리포트 (${data.dateKst})`,
        "",
        formatEarningsMessage(earnings),
        "",
        formatPayoutMessage(payout),
        "",
        formatReportMessage(data),
      ].join("\n")
    );

    // 지급 기준(1만원)을 이번달에 처음 넘은 날에만 별도 알림 1회
    const alerted = await shouldAlertPayoutReached(payout);
    if (alerted) {
      await sendTelegramMessage(
        [
          "🎉 출금 기준 달성!",
          "",
          `이번달 미지급 누적이 ${Math.round(payout.unpaidBalance).toLocaleString("ko-KR")}원이 되어`,
          `지급 기준 10,000원을 넘었어요.`,
          "",
          `📅 지급 예정일: ${payout.expectedPayoutDate}`,
          "등록해둔 계좌로 자동 입금돼요 (별도 출금 신청 불필요).",
          "원천징수 3.3%를 뺀 금액이 들어옵니다.",
          "",
          "※ 계좌·주민등록번호가 미등록이면 지급이 보류되니",
          "쿠팡파트너스 > 설정에서 한 번 확인해 주세요.",
        ].join("\n")
      );
      // 전송이 성공했을 때만 1회성 플래그 기록 (실패 시 다음 실행에서 재시도)
      await markPayoutAlerted(payout);
    }

    return NextResponse.json({ ok: true, ...data, earnings, payout, alerted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

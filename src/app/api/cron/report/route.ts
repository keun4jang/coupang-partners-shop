import { NextRequest, NextResponse } from "next/server";
import { buildReportData, formatReportMessage } from "@/lib/report";
import { getEarnings, formatEarningsMessage } from "@/lib/earnings";
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
    const [data, earnings] = await Promise.all([buildReportData(), getEarnings()]);
    await sendTelegramMessage(
      [
        `📊 살림템 리포트 (${data.dateKst})`,
        "",
        formatEarningsMessage(earnings),
        "",
        formatReportMessage(data),
      ].join("\n")
    );
    return NextResponse.json({ ok: true, ...data, earnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { runScout, formatScoutMessage } from "@/lib/scout";
import { sendTelegramMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 매일 아침 자동 스카우트 (Vercel Cron).
 * 쿠팡에서 주부 인기 상품 후보를 모아 products candidate 로 등록하고 텔레그램 알림.
 * 승인 게이트: 여기서는 "후보"만 올리고 영상 제작은 하지 않는다(사람이 승인 후).
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await runScout();
    await sendTelegramMessage(formatScoutMessage(result));
    return NextResponse.json({
      ok: true,
      registered: result.registered.length,
      skippedDuplicate: result.skippedDuplicate,
      errors: result.errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await sendTelegramMessage(`⚠️ 스카우트 자동실행 실패: ${msg}`);
    } catch {
      // 알림 실패는 무시
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

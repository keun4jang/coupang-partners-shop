import { NextRequest, NextResponse } from "next/server";
import { runScout, formatScoutMessage } from "@/lib/scout";
import { queueDailyVideos } from "@/lib/videoItems";
import { sendTelegramMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** 하루에 자동으로 만들 영상 개수 */
const DAILY_VIDEO_TARGET = 3;

/**
 * 매일 아침 자동 파이프라인 (Vercel Cron).
 *  1) 쿠팡에서 주부 인기 상품 후보를 모아 products candidate 로 등록
 *  2) 그중 카테고리가 겹치지 않는 상품으로 하루치 영상(3개)을 pending 으로 큐잉
 * 큐잉된 영상은 렌더 워커(GitHub Actions)가 포맷 D 로 렌더 → 드라이브 업로드한다.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await runScout();

    // 하루치 영상 큐잉 (멱등: 오늘 이미 3개면 아무것도 안 함). 실패해도 스카우트는 성공 처리.
    let queuedNumbers: number[] = [];
    let queueError: string | null = null;
    try {
      const queued = await queueDailyVideos(DAILY_VIDEO_TARGET);
      queuedNumbers = queued.map((v) => v.display_number);
    } catch (e) {
      queueError = e instanceof Error ? e.message : String(e);
    }

    await sendTelegramMessage(
      formatScoutMessage(result) + formatQueueMessage(queuedNumbers, queueError)
    );
    return NextResponse.json({
      ok: true,
      registered: result.registered.length,
      skippedDuplicate: result.skippedDuplicate,
      queued: queuedNumbers,
      queueError,
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

/** 큐잉 결과 텔레그램 문구 */
function formatQueueMessage(
  queuedNumbers: number[],
  queueError: string | null
): string {
  if (queueError) return `\n\n⚠️ 오늘 영상 큐잉 실패: ${queueError}`;
  if (queuedNumbers.length === 0) {
    return "\n\n🎬 오늘 만들 영상은 이미 준비돼 있어요.";
  }
  const nums = queuedNumbers.map((n) => `${n}번`).join(", ");
  return (
    `\n\n🎬 오늘 만들 영상 ${queuedNumbers.length}개를 큐에 넣었어요: ${nums}` +
    `\n렌더가 끝나면 구글드라이브에 자동으로 올라가요.`
  );
}

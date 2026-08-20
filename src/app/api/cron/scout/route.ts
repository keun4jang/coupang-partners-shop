import { NextRequest, NextResponse } from "next/server";
import { runScout, formatScoutMessage } from "@/lib/scout";
import { queueDailyVideos } from "@/lib/videoItems";
import { sendTelegramMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cronAuth";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 하루에 자동으로 만들 영상 개수. app_settings.daily_video_target 으로 조정한다
 * (없으면 아래 기본값). **UPLOAD_SCHEDULE 의 슬롯 개수와 같아야 한다** - 큐잉이
 * 적으면 슬롯이 비고, 많으면 발행 안 된 영상이 쌓인다.
 *
 * 유튜브 무료 할당량(하루 10,000 units, 편당 약 2,150)이 4편에서 끊기지만,
 * 그 이상은 워커가 인스타 전용으로 발행하므로(youtube_daily_cap) 이 값 자체는
 * 4를 넘겨도 된다. 실제 상한은 상품 재고다.
 */
const DEFAULT_DAILY_VIDEO_TARGET = 4;

async function dailyVideoTarget(): Promise<number> {
  const raw = (await getSetting("daily_video_target"))?.trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 12
    ? Math.floor(n)
    : DEFAULT_DAILY_VIDEO_TARGET;
}

/**
 * 매일 아침 자동 파이프라인 (Vercel Cron).
 *  1) 쿠팡에서 주부 인기 상품 후보를 모아 products candidate 로 등록
 *  2) 그중 카테고리가 겹치지 않는 상품으로 하루치 영상을 pending 으로 큐잉
 * 큐잉된 영상은 렌더 워커(GitHub Actions)가 포맷 D 로 렌더 → 드라이브 업로드한다.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    // 수집에 쓸 시간 상한. maxDuration 60초 중 수집은 38초까지만 쓰고,
    // 나머지는 영상 큐잉·알림 몫으로 남긴다. 예산이 없으면 수집이 시간을 다 먹어
    // 큐잉이 통째로 잘린다(실측 8/20: 6편 목표에 3편만 큐잉되고 끝났다).
    const startedAt = Date.now();

    // 순서 주의: 영상 큐잉을 먼저 한다.
    //
    // 예전엔 runScout 이 앞에 있었는데, runScout 은 loadKnownProductIds 조회 실패나
    // 후보 insert 실패를 그대로 던진다. 그러면 아래 큐잉이 호출조차 안 돼 그날
    // pending 이 0개가 되고 업로드 슬롯이 통째로 빈다 - 부가 작업(수집) 때문에
    // 본류(발행)가 멈추는 구조였다. 재고는 이미 쌓여 있으므로 오늘 수집 결과가
    // 없어도 큐잉은 문제없이 돌아간다.
    let queuedNumbers: number[] = [];
    let queueError: string | null = null;
    try {
      const queued = await queueDailyVideos(await dailyVideoTarget());
      queuedNumbers = queued.map((v) => v.display_number);
    } catch (e) {
      queueError = e instanceof Error ? e.message : String(e);
    }

    // 수집은 실패해도 이 요청을 실패로 만들지 않는다 (다음 날 다시 돈다)
    let result: Awaited<ReturnType<typeof runScout>>;
    try {
      result = await runScout({ deadlineAt: startedAt + 38_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("스카우트 실패(큐잉은 완료됨):", msg);
      result = {
        registered: [],
        skippedDuplicate: 0,
        skippedFiltered: 0,
        skippedSpamTitle: 0,
        sourceStats: {},
        aliCandidates: 0,
        errors: [`스카우트 전체 실패: ${msg}`],
      };
    }

    const scoutMsg = (
      formatScoutMessage(result) + formatQueueMessage(queuedNumbers, queueError)
    ).trim();
    if (scoutMsg) await sendTelegramMessage(scoutMsg);
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

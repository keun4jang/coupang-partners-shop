/**
 * 하루치 영상 큐잉 러너 (GitHub Actions 용).
 *
 * 왜 따로 있나: 원래 큐잉은 Vercel 크론(/api/cron/scout)이 했는데, 이 프로젝트는
 * 리네임 이력 때문에 "도메인이 가리키는 배포"와 "Vercel 이 프로덕션으로 아는 배포"가
 * 갈라져 있다(.github/workflows/vercel-domain-sync.yml 주석 참고). 크론은 후자에서
 * 도는데 그게 옛 배포라, 코드를 고쳐 push 해도 크론 동작이 안 바뀐다.
 * 실측 2026-08-21: 큐잉이 계속 3편(옛 하드코딩 상수)이었고, 오늘 등록된 상품 출처가
 * 오래전에 지운 키워드('청소용품')였다.
 *
 * Actions 는 브랜치를 그대로 체크아웃하므로 항상 현재 코드다. 발행이 멈추는 것보다
 * 나쁜 건 없으니, 큐잉만큼은 여기서도 돌려 확실히 만든다.
 * 멱등이라 Vercel 크론과 겹쳐 돌아도 하루 목표치를 넘기지 않는다.
 *
 * 실행: npx tsx worker/queue-runner.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { queueDailyVideos } from "../src/lib/videoItems";
import { getSetting } from "../src/lib/settings";
import { freshProductCount } from "../src/lib/productSelector";
import { sendTelegramMessage } from "../src/lib/telegram";

const DEFAULT_TARGET = 4;

/** 남은 재고가 이 일수 미만이면 경보 (수집을 고칠 시간을 벌어야 한다) */
const LOW_STOCK_DAYS = 3;

async function target(): Promise<number> {
  const raw = (await getSetting("daily_video_target"))?.trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 12 ? Math.floor(n) : DEFAULT_TARGET;
}

/**
 * 재고 고갈 경보.
 *
 * 실측 2026-08-25: 8/21 이후 신규 상품 유입이 0인데 하루 6편씩 소비돼 재고가
 * 13개(약 2일치)까지 줄었는데도 아무 알림이 없었다. scout.yml 은 자격증명이
 * 없으면 "조용히 건너뛰기"로 설계돼 있어 계속 초록불이었고(그게 의도였지만
 * 결과적으로 유일한 수집 경로가 죽은 걸 가렸다), 발행이 실제로 멈추기 전까지는
 * 어디에도 신호가 없었다. 재고는 멈추고 나서 알면 이미 늦으므로 미리 알린다.
 */
async function warnIfLowStock(perDay: number): Promise<void> {
  try {
    const stock = await freshProductCount();
    const days = perDay > 0 ? stock / perDay : Infinity;
    console.log(`미사용 상품 재고 ${stock}개 (하루 ${perDay}편 기준 약 ${days.toFixed(1)}일치)`);
    if (days >= LOW_STOCK_DAYS) return;

    await sendTelegramMessage(
      [
        "⚠️ 상품 재고 부족",
        "",
        `남은 재고: ${stock}개 (하루 ${perDay}편 기준 약 ${days.toFixed(1)}일치)`,
        "",
        "재고가 바닥나면 영상 발행이 멈춥니다.",
        "쿠팡 상품 수집(스카우트)이 도는지 확인이 필요해요.",
      ].join("\n")
    );
  } catch (e) {
    // 경보 실패가 큐잉을 막지는 않는다
    console.warn("재고 경보 실패(무시):", (e as Error).message.slice(0, 150));
  }
}

async function main() {
  const want = await target();
  console.log(`하루치 영상 큐잉 (목표 ${want}편, 멱등)`);
  const queued = await queueDailyVideos(want);
  if (queued.length === 0) {
    console.log("추가 큐잉 없음 (오늘 목표치를 이미 채웠거나 후보 없음)");
  } else {
    console.log(
      `큐잉 ${queued.length}편: ${queued.map((v) => `${v.display_number}번`).join(", ")}`
    );
  }
  await warnIfLowStock(want);
}

main().catch((e) => {
  console.error("큐잉 실패:", e);
  process.exit(1);
});

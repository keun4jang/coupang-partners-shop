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

const DEFAULT_TARGET = 4;

async function target(): Promise<number> {
  const raw = (await getSetting("daily_video_target"))?.trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 12 ? Math.floor(n) : DEFAULT_TARGET;
}

async function main() {
  const want = await target();
  console.log(`하루치 영상 큐잉 (목표 ${want}편, 멱등)`);
  const queued = await queueDailyVideos(want);
  if (queued.length === 0) {
    console.log("추가 큐잉 없음 (오늘 목표치를 이미 채웠거나 후보 없음)");
    return;
  }
  console.log(
    `큐잉 ${queued.length}편: ${queued.map((v) => `${v.display_number}번`).join(", ")}`
  );
}

main().catch((e) => {
  console.error("큐잉 실패:", e);
  process.exit(1);
});

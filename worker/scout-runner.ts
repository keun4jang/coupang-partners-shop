/**
 * 스카우트 러너 (Phase 1).
 * 쿠팡 베스트에서 주부 인기 상품 후보를 모아 products 에 candidate 로 등록하고
 * 텔레그램으로 요약을 보낸다.
 *
 * 실행:
 *   npm run scout          # 실제 등록 + 텔레그램 알림
 *   npm run scout -- --dry # DB 저장/알림 없이 수집만 출력 (테스트)
 *
 * 자동화: 매일 아침 스케줄러/Cron 에서 `npm run scout` 를 호출하면 된다.
 * (Vercel Cron 으로 옮기는 건 Phase 2 에서)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { runScout, formatScoutMessage } from "../src/lib/scout";
import { sendTelegramMessage } from "../src/lib/telegram";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(dry ? "=== 스카우트 (DRY RUN) ===" : "=== 스카우트 시작 ===");

  const result = await runScout({ dryRun: dry });

  console.log(`\n새 후보 ${result.registered.length}개:`);
  for (const c of result.registered) {
    console.log(`  · [${c.category}] ${c.product_name} · ${c.price_text} (cpid:${c.productId})`);
  }
  console.log(
    `\n중복 제외: ${result.skippedDuplicate} · 기타 제외: ${result.skippedFiltered}`
  );
  if (result.errors.length) console.log("오류:", result.errors.join(" | "));

  if (dry) {
    console.log("\n(DRY RUN 이라 DB 저장/텔레그램 전송은 건너뜀)");
    return;
  }

  try {
    await sendTelegramMessage(formatScoutMessage(result));
    console.log("\n텔레그램 알림 전송 완료");
  } catch (e) {
    console.error("텔레그램 전송 실패:", (e as Error).message);
  }
  console.log("=== 스카우트 완료 ===");
}

main().catch((e) => {
  console.error("스카우트 실패:", e);
  process.exit(1);
});

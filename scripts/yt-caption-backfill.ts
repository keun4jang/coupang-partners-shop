/**
 * 기존 유튜브 영상 자동자막(ASR) 억제 백필.
 *
 * 왜: 새로 올라가는 영상은 워커가 업로드 직후 suppressAutoCaptions 로 자동 처리하지만,
 * 그 전에 올라간 영상들은 여전히 자동자막이 뜬다. 이 스크립트가 기존 영상에
 * 빈 표준 자막 트랙을 올려 자동자막을 억제한다.
 *
 * 비용: 전부 "무료" 경로만 쓴다.
 *  - GitHub Actions(퍼블릭 저장소, 무료) 또는 로컬에서 실행
 *  - 유튜브 captions.insert 는 400 units/개 (무료 일일 할당량 10,000 내)
 *  - 유료 할당량 증설은 절대 요청하지 않는다.
 *
 * 할당량 보호: 매일 자동게시 3개(영상 1,600 + 썸네일 50 + 자막억제 450 ≈ 2,100/개, 총 ≈6,300)를
 * 먼저 보장하고, 이 백필은 남는 여유분인 기본 3,000 units 만 쓰고 멈춘다(YT_BACKFILL_BUDGET 로 조정).
 * 6,300 + 3,000 = 9,300 < 무료 일일한도 10,000 → 게시가 항상 우선, 비용 0.
 * 남은 영상은 다음 실행(=다음날 할당량 리셋 후)에 마저 처리한다.
 *
 * 진행상태: app_settings.yt_caption_suppressed 에 처리 완료한 display_number 를
 * 콤마로 누적 저장한다. 재실행 시 이미 된 건 API 호출 없이 건너뛴다(멱등).
 *
 * 실행: npm run yt:backfill-captions   (또는 GitHub Actions: yt-caption-backfill 워크플로)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { supabaseAdmin } from "../src/lib/supabase";
import { getSetting, setSetting } from "../src/lib/settings";
import {
  suppressAutoCaptions,
  hasYoutubeEnv,
  loadYoutubeCredsFromSettings,
} from "../src/lib/youtube";

const DONE_KEY = "yt_caption_suppressed";
// 하루 자동게시 3개(≈6,300 units)를 먼저 보장하고 남는 여유분만 백필에 쓴다.
// 6,300 + 3,000 = 9,300 < 무료 일일한도 10,000 (게시가 항상 우선).
const BUDGET = Number(process.env.YT_BACKFILL_BUDGET ?? 3000);
// 비용(units): 새로 삽입 = list(50)+insert(400)=450, 이미 있어 스킵 = list(50)만
const COST_INSERT = 450;
const COST_EXISTS = 50;

/** youtube_url(…/shorts/VIDEOID 또는 …/watch?v=VIDEOID)에서 videoId 추출 */
function extractVideoId(url: string): string | null {
  const shorts = url.match(/shorts\/([A-Za-z0-9_-]{6,})/);
  if (shorts) return shorts[1];
  const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watch) return watch[1];
  const be = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (be) return be[1];
  const tail = url.split("/").pop();
  return tail && /^[A-Za-z0-9_-]{6,}$/.test(tail) ? tail : null;
}

async function main() {
  // app_settings 의 force-ssl 토큰 우선 (Actions WORKER_ENV 구토큰엔 captions 스코프 없음)
  await loadYoutubeCredsFromSettings();
  if (!hasYoutubeEnv()) {
    console.error("유튜브 환경변수 미설정 - 백필 중단");
    process.exit(1);
  }

  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("video_items")
    .select("display_number, youtube_url")
    .not("youtube_url", "is", null)
    .order("display_number", { ascending: true });
  if (error) {
    console.error("video_items 조회 실패:", error.message);
    process.exit(1);
  }
  const videos = (rows ?? []).filter((r) => r.youtube_url);
  console.log(`유튜브 영상 ${videos.length}개 확인`);

  // 이미 처리한 display_number 집합
  const doneRaw = (await getSetting(DONE_KEY)) ?? "";
  const done = new Set(
    doneRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  console.log(`이미 처리됨: ${done.size}개`);

  const pending = videos.filter((v) => !done.has(String(v.display_number)));
  console.log(`처리 대상(남음): ${pending.length}개 / 예산 ${BUDGET} units`);

  let spent = 0;
  let processed = 0;
  let consecutiveFail = 0;

  for (const v of pending) {
    // 최악의 경우(삽입)를 기준으로 예산을 넘기지 않게 미리 멈춘다.
    if (spent + COST_INSERT > BUDGET) {
      console.log(
        `⏸  예산 소진 임박(${spent} units). 남은 ${pending.length - processed}개는 다음 실행(할당량 리셋 후)에 처리.`
      );
      break;
    }
    const videoId = v.youtube_url ? extractVideoId(v.youtube_url) : null;
    if (!videoId) {
      console.warn(`${v.display_number}번: videoId 추출 실패(${v.youtube_url}) - 건너뜀`);
      done.add(String(v.display_number)); // 다시 시도하지 않게 완료로 기록
      continue;
    }

    const result = await suppressAutoCaptions(videoId);
    if (result === "inserted" || result === "exists") {
      done.add(String(v.display_number));
      await setSetting(DONE_KEY, Array.from(done).join(",")); // 진행 즉시 저장(중단 대비)
      spent += result === "inserted" ? COST_INSERT : COST_EXISTS;
      processed += 1;
      consecutiveFail = 0;
      const tag = result === "inserted" ? "억제완료" : "이미됨";
      console.log(`✅ ${v.display_number}번 ${tag} (누적 ${spent} units)`);
    } else {
      consecutiveFail += 1;
      console.warn(`⚠️ ${v.display_number}번 실패 (연속 ${consecutiveFail}회)`);
      // 연속 실패는 할당량 소진(403) 신호일 가능성이 높다 → 조용히 중단, 다음날 재시도
      if (consecutiveFail >= 2) {
        console.log("연속 실패로 중단(할당량 소진 추정). 다음 실행에 마저 처리.");
        break;
      }
    }
  }

  await setSetting(DONE_KEY, Array.from(done).join(","));
  const remaining = videos.filter((v) => !done.has(String(v.display_number))).length;
  console.log(
    `\n요약: 이번에 ${processed}개 처리(${spent} units). 전체 완료 ${done.size}/${videos.length}, 남음 ${remaining}개.`
  );
  if (remaining > 0) {
    console.log("남은 영상은 다음 할당량 리셋 후 워크플로를 다시 돌리면 됩니다.");
  } else {
    console.log("🎉 모든 기존 영상 자동자막 억제 완료.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

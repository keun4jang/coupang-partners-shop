/**
 * 이미 게시된 유튜브 영상 설명에 대가성 고지를 소급 추가한다.
 *
 * 배경: Disclosure 컴포넌트가 템플릿에 연결돼 있지 않아 기존 영상 화면에는 고지가
 * 없고, 캡션에도 없었다. 영상 재렌더·재업로드는 비용·지표 손실이 커서, 설명(캡션)에만
 * 고지를 덧붙여 위험을 줄인다.
 *
 * 비용(units): videos.list 1 + videos.update 50 = 영상당 51.
 * 하루 자동게시 3개(≈6,300)를 먼저 보장하고 남는 여유분만 쓴다.
 * 무료 일일한도 10,000 → 기본 예산 3,000 (약 58개). 남으면 다음 날 이어서.
 *
 * 실행: npm run yt:backfill-disclosure
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { supabaseAdmin } from "../src/lib/supabase";
import { getSetting, setSetting } from "../src/lib/settings";
import {
  prependToDescription,
  hasYoutubeEnv,
  loadYoutubeCredsFromSettings,
} from "../src/lib/youtube";
import { DISCLOSURE_LINE } from "../src/lib/ai";

const DONE_KEY = "yt_disclosure_added";
const BUDGET = Number(process.env.YT_DISCLOSURE_BUDGET ?? 3000);
const COST_PER_VIDEO = 51; // list(1) + update(50)
/** 이미 고지가 있는지 판단하는 표식 (문구가 조금 달라도 잡히게 짧게) */
const MARKER = "쿠팡파트너스 활동";

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
  await loadYoutubeCredsFromSettings();
  if (!hasYoutubeEnv()) {
    console.error("유튜브 환경변수 미설정 - 중단");
    process.exit(1);
  }

  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("video_items")
    .select("display_number, youtube_url, caption_text")
    .not("youtube_url", "is", null)
    .order("display_number", { ascending: true });
  if (error) {
    console.error("video_items 조회 실패:", error.message);
    process.exit(1);
  }
  const videos = (rows ?? []).filter((r) => r.youtube_url);
  console.log(`유튜브 게시 영상 ${videos.length}개`);

  const doneRaw = (await getSetting(DONE_KEY)) ?? "";
  const done = new Set(doneRaw.split(",").map((s) => s.trim()).filter(Boolean));
  console.log(`이미 처리됨: ${done.size}개`);

  const pending = videos.filter((v) => !done.has(String(v.display_number)));
  console.log(`처리 대상: ${pending.length}개 / 예산 ${BUDGET} units\n`);

  let spent = 0;
  let updated = 0;
  let skipped = 0;

  for (const v of pending) {
    if (spent + COST_PER_VIDEO > BUDGET) {
      console.log(
        `\n⏸  예산 소진(${spent} units). 남은 ${pending.length - updated - skipped}개는 다음 실행에 처리.`
      );
      break;
    }
    const videoId = extractVideoId(v.youtube_url as string);
    if (!videoId) {
      console.warn(`${v.display_number}번: videoId 추출 실패 - 완료 처리`);
      done.add(String(v.display_number));
      continue;
    }

    const result = await prependToDescription(videoId, DISCLOSURE_LINE, MARKER);
    spent += COST_PER_VIDEO;

    if (result === "updated" || result === "alreadyHas" || result === "notFound") {
      done.add(String(v.display_number));
      if (result === "updated") {
        updated++;
        // DB 캡션도 같이 맞춰 둔다(기록 일치 - 재업로드/참조 시 혼선 방지)
        const caption = v.caption_text ?? "";
        if (!caption.includes(MARKER)) {
          await db
            .from("video_items")
            .update({ caption_text: `${DISCLOSURE_LINE}\n\n${caption}`.trim() })
            .eq("display_number", v.display_number);
        }
        console.log(`✅ ${v.display_number}번 고지 추가 (누적 ${spent} units)`);
      } else {
        skipped++;
        console.log(
          `⏭  ${v.display_number}번 ${result === "alreadyHas" ? "이미 고지 있음" : "영상 없음"}`
        );
      }
      await setSetting(DONE_KEY, [...done].join(","));
    } else {
      console.warn(`⚠️  ${v.display_number}번 일시 실패 - 다음 실행에 재시도`);
    }
  }

  const remaining = videos.length - done.size;
  console.log(
    `\n요약: 이번에 ${updated}개 추가, ${skipped}개 건너뜀(${spent} units). ` +
      `전체 완료 ${done.size}/${videos.length}, 남음 ${remaining}개.`
  );
  if (remaining === 0) console.log("🎉 모든 게시 영상에 대가성 고지 반영 완료.");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});

/**
 * 유튜브 롱폼 "TOP10" 워커.
 *
 * 숏폼 render-worker.ts 와 달리 계속 폴링하지 않는다 - GitHub Actions 크론이
 * 매일 한 번 호출하고, 이 스크립트가 shouldRunLongformToday() 로 "이번엔
 * 쉬어감"을 스스로 판단한다(idempotent - worker/queue-runner.ts 와 같은 패턴).
 * 기본은 매일(사장님 방침 2026-08-23: 주제를 매일 로테이션으로 돌리면 매일
 * 다른 컨텐츠가 되고, 한 달 안에 같은 주제가 돌아올 땐 그 사이 판매·클릭·발행
 * 데이터가 바뀌어 순위도 자연히 갱신된다 - src/lib/longform.ts selectTop10 참고).
 * 주제는 products.source_memo 에 남은 스카우트 세부 키워드 단위로 돈다
 * (사장님 2026-08-24: "판매량이 높은걸로 세부 키워드 단위로도").
 *
 * 처리 흐름:
 *   오늘 차례인지 확인 → 오늘 배정 주제로 TOP10 선정(이미 발행된 숏폼
 *   상품만, N번 재사용, 실제 구매(커미션)·클릭 기준 정렬) → 상품별 나레이션
 *   TTS(숏폼 대본 재사용 - 새 AI 호출 없음) → Remotion 렌더 → 유튜브
 *   업로드(설명란에 상품별 쿠팡/제휴 링크 + 타임스탬프) → longform_items 기록
 *   → 텔레그램 알림
 *
 * 실행:
 *   npx tsx worker/longform-worker.ts            # 실제 업로드(공개 unlisted - 검수용)
 *   npx tsx worker/longform-worker.ts --publish   # 실제 업로드(공개 public)
 *   npx tsx worker/longform-worker.ts --dry-run   # 렌더까지만, 유튜브 업로드 안 함
 *   npx tsx worker/longform-worker.ts --force     # shouldRunLongformToday 무시하고 강행(수동 테스트용)
 *
 * 안전장치(LONGFORM_UPLOAD_OK): 실제 업로드는 --dry-run 여부와 별개로 이
 * 환경변수가 "1" 일 때만 실행된다. GitHub Actions 워크플로 안에서만 설정하고
 * 로컬/개발 .env.local 에는 절대 넣지 않는다 - 로컬에서 무슨 인자로 돌리든
 * 실제 업로드에 닿지 못하게 하는 두 번째 잠금이다.
 *
 * (경위 메모, 2026-08-23) 이 워커를 처음 커밋할 때 .github/workflows/longform.yml
 * 의 schedule 크론(매일 06:00 KST)을 같이 켜뒀는데, "아직 로컬에서 검증 중"
 * 이라고 생각한 사이에 그 크론이 예정대로 실제로 실행돼 채널에 영상이 하나
 * 올라갔다(다행히 코드 기본값대로 비공개(unlisted)였다 - --publish 를 아직
 * 안 붙였던 시점). 로컬 프로세스 문제가 아니라 "라이브 크론이 달린 워크플로를
 * 푸시하면 그 순간부터 실제로 돈다"는 당연한 사실을 놓친 것이었다. 이후로는
 * 이런 사고와 무관하게, 로컬 실행 자체가 절대 업로드에 닿지 못하도록
 * LONGFORM_UPLOAD_OK 를 추가했다(위 문단).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "fs";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { supabaseAdmin } from "../src/lib/supabase";
import { sendTelegramMessage } from "../src/lib/telegram";
import { optionalEnv } from "../src/lib/env";
import { generateNarration } from "../src/lib/tts";
import { fetchImageAsDataUri } from "../src/lib/mediaFetch";
import { youtubeUploadedTodayCount } from "../src/lib/quota";
import {
  hasYoutubeEnv,
  loadYoutubeCredsFromSettings,
  uploadLongformToYoutube,
} from "../src/lib/youtube";
import {
  shouldRunLongformToday,
  selectTop10,
  buildTop10Items,
  itemNarrationLine,
  introNarrationLine,
  OUTRO_NARRATION_LINE,
  longformTitle,
  longformDescription,
  type Top10ItemSnapshot,
} from "../src/lib/longform";
import {
  COVER_FRAME_COUNT,
  top10Ranges,
  type Top10Props,
} from "../remotion/templates/TemplateTop10";

const RENDER_DIR = path.resolve("renders/longform");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const publish = args.includes("--publish");

  // shouldRunLongformToday 가 건너뛰는 구체적 이유(목표 시각 미도달/간격 미도달)를
  // 자체적으로 로그에 남긴다.
  if (!force && !(await shouldRunLongformToday())) {
    return;
  }

  console.log("TOP10 상품 선정 중...");
  const { categoryLabel, topicKind, selected } = await selectTop10();
  console.log(
    `오늘 주제: ${categoryLabel} (${topicKind === "keyword" ? "세부 키워드" : "카테고리 안전망"})`
  );
  if (selected.length < 10) {
    console.log(
      `선정 가능한 상품이 ${selected.length}/10개뿐 - 이번 회차 건너뜀(재고 부족 또는 재사용 쿨다운)`
    );
    return;
  }
  console.log(`카테고리: ${categoryLabel} · 선정 ${selected.length}개`);

  const items: Top10ItemSnapshot[] = buildTop10Items(selected);
  // items 는 10위 -> 1위 순. selected(1위 -> 1위 점수 내림차순)와 매핑하려면 뒤집는다.
  const selectedByRankDesc = selected.slice().reverse(); // 10위 -> 1위, items 와 같은 순서

  // 상품 이미지: CDN 차단 대비 워커가 미리 data URI 로 변환 (숏폼과 동일 패턴)
  console.log("상품 이미지 내장 중...");
  for (const item of items) {
    if (item.imageUrl?.startsWith("http")) {
      const dataUri = await fetchImageAsDataUri(item.imageUrl);
      if (dataUri) item.imageUrl = dataUri;
      else console.warn(`이미지 다운로드 실패(원본 URL 유지): ${item.displayNumber}번`);
    }
  }

  // 나레이션 - 숏폼 대본(hookText/empathyLine/benefit1)을 그대로 재사용한다(신규 AI 호출 없음).
  // 각 항목을 별도 generateNarration() 호출로 나눠서 부른다 - 한 호출당 글자수가
  // 항상 작아(1~3문장) 구글 TTS 무료 등급 상한(GOOGLE_CHAR_CAP_PER_VIDEO=2000)에
  // 절대 안 걸린다(전체를 한 번에 합쳐 부르면 롱폼은 쉽게 넘긴다).
  console.log("나레이션 합성 중...");
  const introLine = introNarrationLine(categoryLabel);
  const introNarration = (await generateNarration([introLine]))?.[0] ?? null;

  for (let i = 0; i < items.length; i++) {
    const line = itemNarrationLine(selectedByRankDesc[i], items[i].rank, items[i].productName);
    const narration = (await generateNarration([line]))?.[0] ?? null;
    items[i].narrationUri = narration?.uri ?? null;
    items[i].narrationSeconds = narration?.seconds ?? null;
  }

  const outroNarration = (await generateNarration([OUTRO_NARRATION_LINE]))?.[0] ?? null;

  const props: Top10Props = {
    categoryLabel,
    items,
    introNarrationUri: introNarration?.uri ?? null,
    introNarrationSeconds: introNarration?.seconds ?? null,
    outroNarrationUri: outroNarration?.uri ?? null,
    outroNarrationSeconds: outroNarration?.seconds ?? null,
  };

  const ranges = top10Ranges(props);
  console.log(
    `나레이션 완료 - 총 길이 약 ${Math.round(
      (ranges[ranges.length - 1]?.from ?? 0) + (ranges[ranges.length - 1]?.dur ?? 0)
    )}초`
  );

  console.log("Remotion 번들 생성 중...");
  const serveUrl = await bundle({
    entryPoint: path.resolve("remotion/index.ts"),
    symlinkPublicDir: true,
  });

  const composition = await selectComposition({
    serveUrl,
    id: "TemplateTop10",
    inputProps: props as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  const dateFolder = new Date().toISOString().slice(0, 10);
  const outDir = path.join(RENDER_DIR, dateFolder);
  fs.mkdirSync(outDir, { recursive: true });
  const videoPath = path.join(outDir, "top10.mp4");
  const thumbnailPath = path.join(outDir, "top10_thumb.png");

  console.log(`렌더링 시작 → ${videoPath}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: videoPath,
    inputProps: props as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  // 썸네일 전용 커버(Top10Cover, 고지 문구 없음 - TemplateTop10.tsx 주석 참고)
  // 스프링 팝인이 자리 잡은 중간 지점을 캡처한다
  await renderStill({
    composition,
    serveUrl,
    output: thumbnailPath,
    frame: Math.round(COVER_FRAME_COUNT * 0.6),
    inputProps: props as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });
  console.log("렌더링 완료");

  const title = longformTitle(categoryLabel);
  const description = longformDescription(
    categoryLabel,
    items,
    ranges.map((r) => r.from)
  );

  const db = supabaseAdmin();
  const itemsSnapshot = items.map((it) => ({
    rank: it.rank,
    displayNumber: it.displayNumber,
    productId: it.productId,
    videoItemId: it.videoItemId,
    productName: it.productName,
    priceText: it.priceText,
    category: it.category,
    linkUrl: it.linkUrl,
  }));

  if (dryRun) {
    console.log("--dry-run: 유튜브 업로드 생략. 결과물 확인용:");
    console.log(`제목: ${title}`);
    console.log(`영상: ${videoPath}`);
    console.log(`썸네일: ${thumbnailPath}`);
    console.log("설명:\n" + description);
    return;
  }

  // --dry-run 인자 하나에만 기대지 않는 두 번째 잠금. GitHub Actions 시크릿에만
  // LONGFORM_UPLOAD_OK=1 을 넣는다 - 로컬 개발환경(.env.local)에는 절대 넣지
  // 않으므로, 이 저장소를 로컬에서 어떻게 실행하든(인자 실수·프로세스 좀비화
  // 등 무엇으로도) 실제 채널 업로드에 닿을 수 없다.
  if (optionalEnv("LONGFORM_UPLOAD_OK") !== "1") {
    console.warn(
      "LONGFORM_UPLOAD_OK 미설정 - 유튜브 업로드 생략(렌더 결과만 남김). " +
        "실제 업로드는 GitHub Actions(WORKER_ENV 시크릿)에서만 일어난다."
    );
    return;
  }

  await loadYoutubeCredsFromSettings();
  if (!hasYoutubeEnv()) {
    console.error("유튜브 업로드 환경변수 없음 - 렌더 결과만 남기고 종료");
    await db.from("longform_items").insert({
      category_label: categoryLabel,
      items: itemsSnapshot,
      video_status: "failed",
      error_message: "유튜브 업로드 환경변수 미설정",
    });
    return;
  }

  // 숏폼과 같은 채널·같은 일일 할당량(10,000 units)을 나눠 쓴다. 롱폼 업로드는
  // videos.insert(1600) + thumbnails.set(50) ≈ 1650 units - 이날 이미 숏폼이
  // 여러 편 올라갔으면(오전 슬롯 이후) 뒤에 올 숏폼분과 부딪힐 수 있어, 이 크론을
  // 숏폼 첫 슬롯(07:30 KST)보다 이르게 돌리는 걸 전제로 "오늘 첫 업로드"일 때만 진행한다.
  // 놓치면 실패로 기록되고 다음날 재시도된다(주간 간격은 completed 에만 걸리므로).
  const ytToday = await youtubeUploadedTodayCount();
  if (ytToday !== 0 && ytToday !== null) {
    const msg = `오늘 이미 유튜브 업로드가 ${ytToday}건 있어 할당량 보호를 위해 이번 회차는 건너뜁니다(내일 재시도)`;
    console.warn(msg);
    await db.from("longform_items").insert({
      category_label: categoryLabel,
      items: itemsSnapshot,
      video_status: "failed",
      error_message: msg,
    });
    return;
  }

  try {
    console.log("유튜브 업로드 중...");
    const result = await uploadLongformToYoutube({
      localPath: videoPath,
      title,
      description,
      tags: ["추천템", "생활꿀템", "쿠팡추천템", "TOP10"],
      thumbnailPath,
      privacyStatus: publish ? "public" : "unlisted",
    });
    console.log("유튜브 업로드 완료:", result.url);

    await db.from("longform_items").insert({
      category_label: categoryLabel,
      items: itemsSnapshot,
      video_status: "completed",
      youtube_url: result.url,
      published_at: new Date().toISOString(),
    });

    await sendTelegramMessage(
      [
        publish ? "🎬 롱폼 TOP10 게시 완료" : "🎬 롱폼 TOP10 업로드 완료 (비공개 링크 - 확인 후 공개 전환 필요)",
        "",
        title,
        result.url,
        "",
        `상품 ${items.length}개 · 카테고리 ${categoryLabel}`,
      ].join("\n")
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("유튜브 업로드 실패:", msg);
    await db.from("longform_items").insert({
      category_label: categoryLabel,
      items: itemsSnapshot,
      video_status: "failed",
      error_message: msg.slice(0, 500),
    });
    await sendTelegramMessage(
      `🚨 롱폼 TOP10 유튜브 업로드 실패\n\n${msg.slice(0, 300)}`
    );
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    const msg = e instanceof Error ? e.message : String(e);
    await sendTelegramMessage(`🚨 롱폼 워커 오류 (프로세스 중단)\n\n${msg.slice(0, 300)}`);
  } catch {
    // 무시
  }
  process.exit(1);
});

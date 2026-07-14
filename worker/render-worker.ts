/**
 * 영상 렌더 워커.
 *
 * Vercel 서버리스에서는 영상 렌더링이 불가능하므로,
 * 로컬 PC 또는 별도 Node 서버에서 이 워커를 실행한다.
 *
 * 실행:
 *   npm run worker        # 계속 돌면서 pending 감시 (30초 간격)
 *   npm run worker:once   # 대기 중인 것만 처리하고 종료
 *
 * 처리 흐름:
 *   pending video_item 발견
 *   → generating 표시
 *   → (문구가 없으면) AI 문구 생성
 *   → Remotion 렌더 (mp4 + 썸네일 png)
 *   → 캡션 txt 생성
 *   → 구글드라이브 업로드 (coupang-shorts/YYYY-MM-DD/)
 *   → video_items 갱신 (completed)
 *   → 텔레그램 완료 알림
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "fs";
import path from "path";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { supabaseAdmin } from "../src/lib/supabase";
import { sendTelegramMessage } from "../src/lib/telegram";
import {
  ensureDateFolder,
  uploadFileToDrive,
  uploadTextToDrive,
  makeFilePublic,
  driveDirectDownloadUrl,
} from "../src/lib/drive";
import { hasYoutubeEnv, uploadShortToYoutube, youtubeTitle, youtubeDescription } from "../src/lib/youtube";
import {
  hasInstagramEnv,
  maybeRefreshInstagramToken,
  publishReelToInstagram,
} from "../src/lib/instagram";
import {
  dateFolderName,
  driveFileName,
  formatDisplayNumber,
  safeProductName,
  shortenProductName,
} from "../src/lib/format";
import { fillVideoCopy } from "../src/lib/videoItems";
import { ctaLine } from "../src/lib/ai";
import { generateNarration } from "../src/lib/tts";
import { fetchStockBrolls } from "../src/lib/broll";
import { sourceProductClips } from "../src/lib/videoSource";
import type { SceneTiming } from "../remotion/types";
import { optionalEnv, siteUrl } from "../src/lib/env";
import { BROLL_BY_CATEGORY, VIDEO } from "../remotion/config/videoConfig";
import type { ShortsProps } from "../remotion/types";
import type { Product, VideoItem, VideoItemWithProduct } from "../src/types/db";

const POLL_INTERVAL_MS = 30_000;
const RENDER_DIR = path.resolve("renders");
// 썸네일은 영상 0프레임(제품사진 꽉 채운 CoverFrame - remotion/components/CoverFrame.tsx)에서 뽑는다.
const THUMBNAIL_FRAME = 0;
// 이 시간 넘게 'generating' 상태인 항목은 워커가 죽은 것으로 보고 재시도한다.
const STALE_GENERATING_MS = 15 * 60_000;

function hasDriveEnv(): boolean {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
  const oauth = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  const serviceAccount = Boolean(
    process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
  );
  return oauth || serviceAccount;
}

function hasTelegramEnv(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALLOWED_CHAT_ID
  );
}

async function notify(text: string): Promise<void> {
  if (!hasTelegramEnv()) {
    console.log("[텔레그램 미설정] 알림 생략:\n" + text);
    return;
  }
  try {
    await sendTelegramMessage(text);
  } catch (e) {
    console.error("텔레그램 알림 실패:", e);
  }
}

/** public/assets/broll 에 실제 존재하는 카테고리 B-roll 파일 선택 */
function pickBrollFile(category: string): string | null {
  const candidates = BROLL_BY_CATEGORY[category] ?? BROLL_BY_CATEGORY["생활템"] ?? [];
  for (const file of candidates) {
    if (fs.existsSync(path.resolve("public", "assets", "broll", file))) {
      return file;
    }
  }
  return null;
}

/**
 * script_text (후킹\n공감\n장점1\n장점2\nCTA) → 렌더 props.
 * ai.ts 가 각 필드의 개행을 이미 정리해 보내므로 보통 정확히 5줄이지만,
 * 혹시 어긋나더라도 CTA 만큼은 항상 정확해야 하므로 파싱에 의존하지 않고
 * displayNumber 로 직접 계산한다 (파싱이 밀려도 CTA 번호는 절대 틀리지 않음).
 */
function buildProps(item: VideoItem, product: Product): ShortsProps {
  const lines = (item.script_text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 신버전 대본은 7줄(사용팁 포함), 구버전은 6줄 - 둘 다 지원한다.
  const isLegacy6 = lines.length === 6;
  if (lines.length > 0 && lines.length !== 7 && lines.length !== 6) {
    console.warn(
      `script_text 줄 수가 예상(7 또는 6)과 다릅니다 (${lines.length}줄) - display_number=${item.display_number}`
    );
  }

  return {
    displayNumber: item.display_number,
    productName: shortenProductName(product.product_name),
    hookLine: item.hook_text ?? lines[0] ?? shortenProductName(product.product_name),
    empathyLine: lines[1] ?? "은근 신경 쓰이잖아요",
    benefit1: lines[2] ?? product.main_benefit ?? "하나 있으면 은근 편해 보여요",
    benefit2: lines[3] ?? "쓰기도 간편해 보이고요",
    usageTip: isLegacy6 ? null : lines[4] ?? null,
    reviewLine: (isLegacy6 ? lines[4] : lines[5]) ?? "후기 많은 제품이라 한번 볼만해요",
    ctaText: ctaLine(item.display_number),
    productImageUrl: product.image_url,
    category: product.category,
    brollFile: pickBrollFile(product.category),
  };
}

/**
 * 상품 이미지를 미리 받아 data URI 로 변환.
 * 쿠팡 CDN 등이 헤드리스 브라우저 요청을 차단해도 영상에 사진이 확실히 실리도록,
 * 브라우저 대신 워커(Node)가 받아서 렌더에 직접 심는다. 실패 시 null (원본 URL 유지).
 */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > IMAGE_MAX_BYTES) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * 나레이션 실측 길이(초)에 맞춰 장면 컷 타이밍을 만든다 (7장면).
 * - 각 장면 = 해당 나레이션 길이 + 아주 짧은 간격(0.22초) → 문장이 뚝뚝 끊기지 않음
 * - 총 길이가 최소(15초)보다 짧을 때만 비율로 늘림
 *   (7장면 대본은 대개 나레이션 자체가 20초를 넘겨 원래 호흡 그대로 재생된다)
 * - 나레이션이 길면 잘리지 않도록 그 길이만큼 영상이 길어진다.
 * - hasTip=false(구버전 6줄 대본)면 사용팁 장면을 0초로 접는다.
 */
const TARGET_SECONDS = 15;
const NARRATION_GAP = 0.22;
function buildSceneTiming(sec: number[], hasTip: boolean): SceneTiming {
  const need = (i: number, min: number) =>
    Math.max(min, (sec[i] ?? 0) + NARRATION_GAP);
  // 최소 장면 길이: 자막을 읽을 시간 + 카드 등장 모션 여유
  // 순서: 후킹 · 공감 · 장점1(카드 등장) · 장점2 · 사용팁 · 후기 · CTA
  let scenes = [
    need(0, 1.5), // 후킹
    need(1, 1.5), // 공감
    need(2, 2.4), // 장점1 (제품 카드 등장)
    need(3, 2.1), // 장점2
    hasTip ? need(4, 2.1) : 0, // 사용팁 (구버전 대본이면 생략)
    need(5, 2.1), // 후기
    Math.max(2.4, (sec[6] ?? 0) + 0.8), // CTA (마무리 여유)
  ];
  const total = scenes.reduce((a, b) => a + b, 0);
  if (total < TARGET_SECONDS) {
    const scale = TARGET_SECONDS / total;
    scenes = scenes.map((s) => s * scale);
  }
  const toFrame = (x: number) => Math.round(x * VIDEO.fps) / VIDEO.fps;
  let acc = 0;
  const ends = scenes.map((s) => toFrame((acc += s)));
  return {
    hookTo: ends[0],
    empathyTo: ends[1],
    benefit1To: ends[2],
    benefit2To: ends[3],
    tipTo: ends[4],
    reviewTo: ends[5],
    ctaTo: ends[6],
  };
}

let cachedBundle: string | null = null;
async function getBundle(): Promise<string> {
  if (cachedBundle) return cachedBundle;
  console.log("Remotion 번들 생성 중...");
  cachedBundle = await bundle({
    entryPoint: path.resolve("remotion/index.ts"),
  });
  return cachedBundle;
}

async function renderVideo(
  item: VideoItem,
  product: Product
): Promise<{ videoPath: string; thumbnailPath: string; brollOrigin: string }> {
  const inputProps = buildProps(item, product);

  // 렌더할 실제 템플릿. FORCE_TEMPLATE 로 배치 렌더 시 강제 지정 가능
  // (DB 제약이 아직 'D' 를 안 받을 때 D 포맷을 뽑기 위한 안전장치).
  const effectiveTemplate = optionalEnv("FORCE_TEMPLATE") ?? item.template_type;

  // 포맷 D 배경: ① 상품 영상 자동 소싱(캐시→알리 매칭) → ② 스톡 → ③ 블러 상품사진
  let brollOrigin = "배경 없음(블러 사진)";
  if (effectiveTemplate === "D") {
    console.log("상품 영상 자동 소싱 중...");
    const sourced = await sourceProductClips(product, item.display_number, 4);
    if (sourced.files.length > 0) {
      inputProps.brollFiles = sourced.files;
      cachedBundle = null;
      brollOrigin = sourced.origin;
      console.log(`상품 영상 사용 (${sourced.origin}): ${sourced.files.join(", ")}`);
    } else {
      console.log("실사용 스톡 영상 검색 중 (4컷)...");
      const brolls = await fetchStockBrolls(
        product.category,
        item.display_number,
        4,
        product.product_name
      );
      if (brolls.length > 0) {
        inputProps.brollFiles = brolls.map((b) => b.file);
        // 새로 받은 클립이 번들에 포함되도록 번들 캐시 무효화
        cachedBundle = null;
        brollOrigin = "실사용 스톡(Pexels)";
        console.log(
          `스톡 클립 ${brolls.length}개 사용: ` +
            brolls.map((b) => `${b.file}(${b.durationSec}s)`).join(", ")
        );
      }
    }
  }

  const serveUrl = await getBundle();

  // 상품 이미지 사전 다운로드 (CDN 차단 대비) → data URI 로 교체
  if (inputProps.productImageUrl?.startsWith("http")) {
    const dataUri = await fetchImageAsDataUri(inputProps.productImageUrl);
    if (dataUri) {
      inputProps.productImageUrl = dataUri;
      console.log("상품 이미지 내장 완료");
    } else {
      console.warn("상품 이미지 다운로드 실패 - 브라우저 로드 시도로 폴백");
    }
  }

  // 나레이션 TTS (실패해도 무음으로 진행 - 영상 생성을 막지 않는다)
  console.log("나레이션 합성 중...");
  const narrationLines = await generateNarration([
    inputProps.hookLine,
    inputProps.empathyLine,
    inputProps.benefit1,
    inputProps.benefit2,
    inputProps.usageTip ?? "", // 구버전 대본이면 빈 줄 → 무음(0초 장면)
    inputProps.reviewLine,
    inputProps.ctaText,
  ]);
  if (narrationLines) {
    inputProps.narration = narrationLines.map((l) => l?.uri ?? null);
    // 장면 컷을 나레이션 실측 길이에 맞춘다
    inputProps.timing = buildSceneTiming(
      narrationLines.map((l) => l?.seconds ?? 0),
      Boolean(inputProps.usageTip)
    );
    console.log(
      `나레이션 ${narrationLines.filter(Boolean).length}/7줄 · ` +
        `영상 길이 ${inputProps.timing.ctaTo.toFixed(1)}초로 컷 구성`
    );
  } else {
    inputProps.narration = null;
    inputProps.timing = null;
    console.log("나레이션 없음 (TTS 실패 또는 비활성) - 고정 15초 타이밍으로 진행");
  }

  const compositionId = `Template${effectiveTemplate}`;

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  const outDir = path.join(
    RENDER_DIR,
    `${item.display_number}_${safeProductName(product.product_name)}`
  );
  fs.mkdirSync(outDir, { recursive: true });

  const videoPath = path.join(outDir, driveFileName(item.display_number, product.product_name, "video"));
  const thumbnailPath = path.join(outDir, driveFileName(item.display_number, product.product_name, "thumbnail"));

  console.log(`렌더링 시작: ${compositionId} → ${videoPath}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: videoPath,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  await renderStill({
    composition,
    serveUrl,
    output: thumbnailPath,
    frame: THUMBNAIL_FRAME,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  return { videoPath, thumbnailPath, brollOrigin };
}

/**
 * row 를 이 워커가 처리하도록 원자적으로 점유한다.
 * video_status='pending' 조건이 걸린 UPDATE 이므로, 여러 워커 프로세스가
 * 동시에 폴링하더라도 이 조건을 만족한 단 하나의 요청만 행을 갱신하고
 * 나머지는 0행 갱신(빈 결과)이 되어 자연히 건너뛴다 - 중복 렌더/업로드 방지.
 */
async function claimItem(id: string): Promise<VideoItemWithProduct | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("video_items")
    .update({ video_status: "generating", error_message: null })
    .eq("id", id)
    .eq("video_status", "pending")
    .select("*, products(*)")
    .maybeSingle();

  if (error) {
    console.error(`항목 점유 실패 (id=${id}):`, error.message);
    return null;
  }
  return (data as VideoItemWithProduct | null) ?? null;
}

/**
 * 워커가 렌더 도중 죽어 'generating' 상태로 멈춘 항목을 되돌린다.
 * 다시 pending 으로 바꿔 다음 폴링에서 재시도되게 한다.
 */
async function reclaimStaleGenerating(): Promise<void> {
  const db = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_GENERATING_MS).toISOString();

  const { data, error } = await db
    .from("video_items")
    .update({
      video_status: "pending",
      error_message: "이전 렌더가 중단되어 자동으로 재시도합니다.",
    })
    .eq("video_status", "generating")
    .lt("updated_at", staleBefore)
    .select("id, display_number");

  if (error) {
    console.error("정체된 generating 항목 복구 실패:", error.message);
    return;
  }
  for (const row of data ?? []) {
    console.warn(`정체된 항목을 재시도 대기로 되돌림: ${formatDisplayNumber(row.display_number)}`);
  }
}

async function processItem(row: VideoItemWithProduct): Promise<void> {
  const db = supabaseAdmin();
  const product = row.products;
  const number = formatDisplayNumber(row.display_number);
  console.log(`\n=== ${number} ${product.product_name} 처리 시작 ===`);

  try {
    // 문구가 아직 없으면 여기서 생성 (webhook 실패 대비)
    let item: VideoItem = row;
    if (!item.script_text || !item.caption_text) {
      console.log("문구 생성 중...");
      item = await fillVideoCopy(item, product);
    }

    const { videoPath, thumbnailPath, brollOrigin } = await renderVideo(item, product);
    const captionText = item.caption_text ?? "";

    let driveVideoUrl: string | null = null;
    let driveVideoFileId: string | null = null;
    let driveCaptionUrl: string | null = null;
    let driveThumbnailUrl: string | null = null;
    let driveNote: string | null = null;

    if (hasDriveEnv()) {
      // 렌더는 이미 성공했으므로, 업로드가 실패해도 영상 자체는 완료로 남긴다.
      // (드라이브 설정 문제로 렌더 결과가 통째로 실패 처리되면 안 됨)
      try {
        console.log("구글드라이브 업로드 중...");
        const folderId = await ensureDateFolder(dateFolderName());
        const video = await uploadFileToDrive(
          folderId,
          driveFileName(item.display_number, product.product_name, "video"),
          "video/mp4",
          videoPath
        );
        driveVideoUrl = video.url;
        driveVideoFileId = video.id;
        driveThumbnailUrl = (
          await uploadFileToDrive(
            folderId,
            driveFileName(item.display_number, product.product_name, "thumbnail"),
            "image/png",
            thumbnailPath
          )
        ).url;
        driveCaptionUrl = (
          await uploadTextToDrive(
            folderId,
            driveFileName(item.display_number, product.product_name, "caption"),
            captionText
          )
        ).url;
      } catch (uploadError) {
        const msg =
          uploadError instanceof Error ? uploadError.message : String(uploadError);
        driveNote = `드라이브 업로드 실패(로컬 보관): ${msg.slice(0, 200)}`;
        console.error(driveNote);
      }
    } else {
      console.log("[드라이브 미설정] 로컬 파일로 유지:", videoPath);
    }

    // 유튜브 쇼츠 자동 업로드 (실패해도 영상 자체는 완료 처리 - 재시도는 수동)
    let youtubeUrl: string | null = null;
    let youtubeError: string | null = null;
    if (hasYoutubeEnv()) {
      try {
        console.log("유튜브 업로드 중...");
        const result = await uploadShortToYoutube({
          localPath: videoPath,
          title: youtubeTitle(item.display_number, shortenProductName(product.product_name)),
          description: youtubeDescription(item.display_number, shortenProductName(product.product_name)),
          tags: ["살림템", "생활템", "쿠팡추천템", "Shorts"],
        });
        youtubeUrl = result.url;
        console.log("유튜브 업로드 완료:", youtubeUrl);
      } catch (e) {
        youtubeError = e instanceof Error ? e.message : String(e);
        console.error("유튜브 업로드 실패:", youtubeError);
      }
    }

    // 인스타 릴스 자동 업로드 (드라이브에 올라간 영상을 공개 링크로 메타 서버가 직접 가져감)
    let instagramUrl: string | null = null;
    let instagramError: string | null = null;
    if (hasInstagramEnv()) {
      if (!driveVideoFileId) {
        instagramError = "드라이브 업로드가 안 돼 공개 URL을 만들 수 없음";
      } else {
        try {
          console.log("인스타 릴스 업로드 중...");
          await makeFilePublic(driveVideoFileId);
          const result = await publishReelToInstagram({
            videoUrl: driveDirectDownloadUrl(driveVideoFileId),
            caption: captionText,
          });
          instagramUrl = result.url;
          console.log("인스타 업로드 완료:", instagramUrl);
        } catch (e) {
          instagramError = e instanceof Error ? e.message : String(e);
          console.error("인스타 업로드 실패:", instagramError);
        }
      }
    }

    // 완료 기록. 이 업데이트가 조용히 실패하면 항목이 generating 에 갇혀
    // 워커가 15분마다 같은 영상을 재렌더·재업로드하는 사고가 난다(실제 발생).
    // → 실패 시 반드시 알리고, 최소한 completed 표시만이라도 남겨 루프를 끊는다.
    const { error: completeError } = await db
      .from("video_items")
      .update({
        video_status: "completed",
        drive_video_url: driveVideoUrl,
        drive_caption_url: driveCaptionUrl,
        drive_thumbnail_url: driveThumbnailUrl,
        youtube_url: youtubeUrl,
        youtube_error: youtubeError,
        instagram_url: instagramUrl,
        instagram_error: instagramError,
        landing_visible: true,
        error_message: driveNote,
      })
      .eq("id", item.id);
    if (completeError) {
      console.error("완료 기록 실패:", completeError.message);
      // 폴백: 상태만이라도 completed 로 (재렌더 루프 방지)
      const { error: fallbackError } = await db
        .from("video_items")
        .update({ video_status: "completed", landing_visible: true })
        .eq("id", item.id);
      await notify(
        [
          "🚨 시스템 문제 발생",
          "",
          "어디서: 렌더 워커 DB 기록",
          `무엇이: ${number} 완료 기록 실패 (${completeError.message.slice(0, 150)})`,
          fallbackError
            ? "⚠️ 폴백도 실패 - 이 영상이 반복 업로드될 수 있어요. 관리자 페이지에서 상태를 확인해주세요!"
            : "상태는 완료로 저장했지만 링크 정보가 비어있을 수 있어요.",
        ].join("\n")
      );
    }

    await notify(
      [
        "영상 생성 완료",
        "",
        `번호: ${number}`,
        `상품: ${product.product_name}`,
        `후킹: ${item.hook_text ?? "-"}`,
        `링크페이지: ${siteUrl()}/?q=${item.display_number}`,
        `배경 소스: ${brollOrigin}`,
        `구글드라이브: ${driveVideoUrl ?? `(로컬) ${videoPath}`}`,
        ...(driveNote ? [`※ ${driveNote}`] : []),
        `유튜브: ${youtubeUrl ?? (youtubeError ? `실패 - ${youtubeError.slice(0, 100)}` : "미설정")}`,
        `인스타: ${instagramUrl ?? (instagramError ? `실패 - ${instagramError.slice(0, 100)}` : "미설정")}`,
      ].join("\n")
    );
    console.log(`=== ${number} 완료 ===`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${number} 처리 실패:`, error);
    await db
      .from("video_items")
      .update({ video_status: "failed", error_message: message.slice(0, 500) })
      .eq("id", row.id);
    await notify(`영상 생성 실패\n\n번호: ${number}\n오류: ${message.slice(0, 300)}`);
  }
}

/* ── 업로드 슬롯 게이트: 하루 3개를 아침/점심/저녁에 나눠 올리기 ──────────
 * UPLOAD_SCHEDULE 환경변수("08:40,13:00,19:00" - KST 기준)가 있으면
 * 각 슬롯에 날짜별 랜덤 지터(±30분)를 더한 "오늘의 업로드 시각"을 계산하고,
 * (지금까지 지난 슬롯 수 - 오늘 이미 완료된 영상 수)개만 처리한다.
 * 지터는 날짜+슬롯 번호에서 결정되는 의사난수라 15분마다 깨어나는 워커가
 * 매번 같은 값을 얻는다(별도 상태 저장 불필요). 매일 시각이 조금씩 달라져
 * "봇처럼 정각에 몰아 올리는" 패턴을 피한다. 미설정 시 기존처럼 즉시 전부 처리.
 */
const KST_OFFSET_MS = 9 * 3600_000;
const SLOT_JITTER_MINUTES = 30;

function todaysUploadSlots(schedule: string, now: Date): Date[] {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const dayNum = y * 10000 + (m + 1) * 100 + d;
  return schedule
    .split(",")
    .map((raw, i) => {
      const [hh, mm = 0] = raw.trim().split(":").map(Number);
      // 날짜·슬롯별 고정 지터: -30 ~ +30분
      const jitter =
        ((dayNum * 7919 + (i + 1) * 104729) % (SLOT_JITTER_MINUTES * 2 + 1)) -
        SLOT_JITTER_MINUTES;
      return new Date(Date.UTC(y, m, d, hh, mm + jitter) - KST_OFFSET_MS);
    })
    .sort((a, b) => a.getTime() - b.getTime());
}

/** 이번 실행에서 처리할 최대 개수. null = 게이트 없음(전부 처리) */
async function allowedUploadCount(now = new Date()): Promise<number | null> {
  const schedule = optionalEnv("UPLOAD_SCHEDULE");
  if (!schedule) return null;

  const slots = todaysUploadSlots(schedule, now);
  const passed = slots.filter((s) => now >= s).length;
  const next = slots.find((s) => now < s);
  if (passed === 0) {
    console.log(
      `슬롯 대기: 오늘 첫 업로드는 ${next ? fmtKst(next) : "-"} (KST) 예정`
    );
    return 0;
  }

  // 오늘(KST 자정 이후) 이미 완료된 "자동" 영상 수 → 지난 슬롯 수만큼만 채운다
  // (수동 업로드는 슬롯과 무관하므로 세지 않는다 - 수동으로 올려도 자동 3개는 그대로 나감)
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
      KST_OFFSET_MS
  );
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("video_items")
    .select("id", { count: "exact", head: true })
    .eq("video_status", "completed")
    .eq("manual", false)
    .gte("updated_at", kstMidnightUtc.toISOString());
  if (error) {
    console.error("오늘 완료 수 조회 실패(안전하게 대기):", error.message);
    return 0;
  }
  const allowed = Math.max(0, passed - (count ?? 0));
  if (allowed === 0 && next) {
    console.log(`슬롯 충족: 다음 업로드는 ${fmtKst(next)} (KST) 예정`);
  }
  return allowed;
}

function fmtKst(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

async function processPending(): Promise<number> {
  await reclaimStaleGenerating();

  // 인스타 장기 토큰 자동 갱신 (7일 주기, 하루 1회 시도 - 60일 만료 방지)
  await maybeRefreshInstagramToken();

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("video_items")
    .select("id, manual")
    .eq("video_status", "pending")
    .order("display_number", { ascending: true });

  if (error) {
    console.error("pending 조회 실패:", error.message);
    return 0;
  }

  const rows = (data ?? []) as Array<{ id: string; manual: boolean | null }>;
  // 수동 요청(텔레그램 "업로드")은 슬롯 게이트를 우회해 항상 즉시 처리한다.
  const manualIds = rows.filter((r) => r.manual).map((r) => r.id);
  const autoIds = rows.filter((r) => !r.manual).map((r) => r.id);

  // 슬롯 게이트: 자동 항목만 제한 (UPLOAD_SCHEDULE 설정 시)
  const allowed = autoIds.length > 0 ? await allowedUploadCount() : 0;

  let processed = 0;
  let autoProcessed = 0;
  for (const id of [...manualIds, ...autoIds]) {
    const isAuto = !manualIds.includes(id);
    if (isAuto && allowed !== null && autoProcessed >= (allowed ?? 0)) break;
    // pending 조건이 걸린 원자적 UPDATE로 점유를 시도한다.
    // 다른 워커 프로세스가 먼저 점유했다면 null 이 반환되어 자연히 건너뛴다.
    const claimed = await claimItem(id);
    if (!claimed) continue;
    await processItem(claimed);
    processed++;
    if (isAuto) autoProcessed++;
  }
  return processed;
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  console.log(`렌더 워커 시작 (${once ? "1회 실행" : `${POLL_INTERVAL_MS / 1000}초 간격 감시`})`);

  if (once) {
    const n = await processPending();
    console.log(`처리 완료: ${n}건`);
    return;
  }

  for (;;) {
    try {
      await processPending();
    } catch (e) {
      console.error("워커 루프 오류:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch(async (e) => {
  console.error(e);
  // 워커 자체가 죽는 오류(환경변수 누락, DB 연결 실패 등)도 텔레그램으로 알린다.
  // 텔레그램 환경변수마저 없으면 조용히 포기 (GitHub Actions 실패 알림이 2차 안전망).
  try {
    const msg = e instanceof Error ? e.message : String(e);
    await sendTelegramMessage(
      `🚨 렌더 워커 오류 (프로세스 중단)\n\n어디서: 렌더 워커 시작/설정 단계\n오류: ${msg.slice(0, 300)}`
    );
  } catch {
    // 무시
  }
  process.exit(1);
});

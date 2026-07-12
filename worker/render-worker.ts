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
import { ensureDateFolder, uploadFileToDrive, uploadTextToDrive } from "../src/lib/drive";
import {
  dateFolderName,
  driveFileName,
  formatDisplayNumber,
  safeProductName,
} from "../src/lib/format";
import { fillVideoCopy } from "../src/lib/videoItems";
import { ctaLine } from "../src/lib/ai";
import { optionalEnv, siteUrl } from "../src/lib/env";
import { BROLL_BY_CATEGORY, VIDEO } from "../remotion/config/videoConfig";
import type { ShortsProps } from "../remotion/types";
import type { Product, VideoItem, VideoItemWithProduct } from "../src/types/db";

const POLL_INTERVAL_MS = 30_000;
const RENDER_DIR = path.resolve("renders");
const THUMBNAIL_SECOND = 5; // 제품 카드가 보이는 시점
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

  if (lines.length > 0 && lines.length !== 5) {
    console.warn(
      `script_text 줄 수가 예상(5)과 다릅니다 (${lines.length}줄) - display_number=${item.display_number}`
    );
  }

  return {
    displayNumber: item.display_number,
    productName: product.product_name,
    hookLine: item.hook_text ?? lines[0] ?? product.product_name,
    empathyLine: lines[1] ?? "은근 신경 쓰이잖아요",
    benefit1: lines[2] ?? product.main_benefit ?? "하나 있으면 은근 편해 보여요",
    benefit2: lines[3] ?? "집에 두면 생각보다 자주 쓸 것 같아요",
    ctaText: ctaLine(item.display_number),
    productImageUrl: product.image_url,
    category: product.category,
    brollFile: pickBrollFile(product.category),
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
): Promise<{ videoPath: string; thumbnailPath: string }> {
  const serveUrl = await getBundle();
  const inputProps = buildProps(item, product);
  const compositionId = `Template${item.template_type}`;

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
    frame: THUMBNAIL_SECOND * VIDEO.fps,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable: optionalEnv("REMOTION_BROWSER_EXECUTABLE"),
  });

  return { videoPath, thumbnailPath };
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

    const { videoPath, thumbnailPath } = await renderVideo(item, product);
    const captionText = item.caption_text ?? "";

    let driveVideoUrl: string | null = null;
    let driveCaptionUrl: string | null = null;
    let driveThumbnailUrl: string | null = null;
    let driveNote: string | null = null;

    if (hasDriveEnv()) {
      // 렌더는 이미 성공했으므로, 업로드가 실패해도 영상 자체는 완료로 남긴다.
      // (드라이브 설정 문제로 렌더 결과가 통째로 실패 처리되면 안 됨)
      try {
        console.log("구글드라이브 업로드 중...");
        const folderId = await ensureDateFolder(dateFolderName());
        driveVideoUrl = await uploadFileToDrive(
          folderId,
          driveFileName(item.display_number, product.product_name, "video"),
          "video/mp4",
          videoPath
        );
        driveThumbnailUrl = await uploadFileToDrive(
          folderId,
          driveFileName(item.display_number, product.product_name, "thumbnail"),
          "image/png",
          thumbnailPath
        );
        driveCaptionUrl = await uploadTextToDrive(
          folderId,
          driveFileName(item.display_number, product.product_name, "caption"),
          captionText
        );
      } catch (uploadError) {
        const msg =
          uploadError instanceof Error ? uploadError.message : String(uploadError);
        driveNote = `드라이브 업로드 실패(로컬 보관): ${msg.slice(0, 200)}`;
        console.error(driveNote);
      }
    } else {
      console.log("[드라이브 미설정] 로컬 파일로 유지:", videoPath);
    }

    await db
      .from("video_items")
      .update({
        video_status: "completed",
        drive_video_url: driveVideoUrl,
        drive_caption_url: driveCaptionUrl,
        drive_thumbnail_url: driveThumbnailUrl,
        landing_visible: true,
        error_message: driveNote,
      })
      .eq("id", item.id);

    await notify(
      [
        "영상 생성 완료",
        "",
        `번호: ${number}`,
        `상품: ${product.product_name}`,
        `후킹: ${item.hook_text ?? "-"}`,
        `링크페이지: ${siteUrl()}/?q=${item.display_number}`,
        `구글드라이브: ${driveVideoUrl ?? `(로컬) ${videoPath}`}`,
        ...(driveNote ? [`※ ${driveNote}`] : []),
        "",
        "직접 TikTok/Reels/Shorts에 업로드하세요.",
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

async function processPending(): Promise<number> {
  await reclaimStaleGenerating();

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("video_items")
    .select("id")
    .eq("video_status", "pending")
    .order("display_number", { ascending: true });

  if (error) {
    console.error("pending 조회 실패:", error.message);
    return 0;
  }

  const candidateIds = (data ?? []).map((row) => row.id as string);
  let processed = 0;
  for (const id of candidateIds) {
    // pending 조건이 걸린 원자적 UPDATE로 점유를 시도한다.
    // 다른 워커 프로세스가 먼저 점유했다면 null 이 반환되어 자연히 건너뛴다.
    const claimed = await claimItem(id);
    if (!claimed) continue;
    await processItem(claimed);
    processed++;
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
import { generateNarration } from "../src/lib/tts";
import { fetchStockBrolls } from "../src/lib/broll";
import type { SceneTiming } from "../remotion/types";
import { optionalEnv, siteUrl } from "../src/lib/env";
import { BROLL_BY_CATEGORY, VIDEO } from "../remotion/config/videoConfig";
import type { ShortsProps } from "../remotion/types";
import type { Product, VideoItem, VideoItemWithProduct } from "../src/types/db";

const POLL_INTERVAL_MS = 30_000;
const RENDER_DIR = path.resolve("renders");
const THUMBNAIL_SECOND = 8; // 제품 카드가 보이는 시점 (product 장면 5.5초 시작 + 등장 모션 여유)
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
    benefit2: lines[3] ?? "후기 많은 제품이라 한번 볼만해요",
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
 * 나레이션 실측 길이(초)에 맞춰 장면 컷 타이밍을 만든다.
 * - 각 장면 = 해당 나레이션 길이 + 짧은 간격(0.45초) → 문장 사이가 늘어지지 않음
 * - 총 길이가 목표(15초)보다 짧으면 비율대로 늘려 정확히 15초로 맞춤
 * - 나레이션이 길면 잘리지 않도록 15초를 넘길 수 있음(최대 나레이션 길이만큼)
 */
const TARGET_SECONDS = 15;
const NARRATION_GAP = 0.45;
function buildSceneTiming(sec: number[]): SceneTiming {
  const need = (i: number, min: number) =>
    Math.max(min, (sec[i] ?? 0) + NARRATION_GAP);
  // 최소 장면 길이: 자막을 읽을 시간 + 카드 등장 모션 여유
  let scenes = [
    need(0, 1.6), // 후킹
    need(1, 1.6), // 공감
    need(2, 2.6), // 제품 + 장점1 (카드 등장)
    need(3, 1.8), // 장점2
    Math.max(2.6, (sec[4] ?? 0) + 1.2), // CTA (마무리 여유)
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
    productTo: ends[2],
    benefit2To: ends[3],
    ctaTo: ends[4],
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
  const inputProps = buildProps(item, product);

  // 렌더할 실제 템플릿. FORCE_TEMPLATE 로 배치 렌더 시 강제 지정 가능
  // (DB 제약이 아직 'D' 를 안 받을 때 D 포맷을 뽑기 위한 안전장치).
  const effectiveTemplate = optionalEnv("FORCE_TEMPLATE") ?? item.template_type;

  // 포맷 D: 실사용 스톡 영상 4컷 배경 (없으면 블러 상품사진으로 폴백)
  if (effectiveTemplate === "D") {
    console.log("실사용 스톡 영상 검색 중 (4컷)...");
    const brolls = await fetchStockBrolls(
      product.category,
      item.display_number,
      4
    );
    if (brolls.length > 0) {
      inputProps.brollFiles = brolls.map((b) => b.file);
      // 새로 받은 클립이 번들에 포함되도록 번들 캐시 무효화
      cachedBundle = null;
      console.log(
        `스톡 클립 ${brolls.length}개 사용: ` +
          brolls.map((b) => `${b.file}(${b.durationSec}s)`).join(", ")
      );
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
    inputProps.ctaText,
  ]);
  if (narrationLines) {
    inputProps.narration = narrationLines.map((l) => l?.uri ?? null);
    // 장면 컷을 나레이션 실측 길이에 맞춘다 (문장 간격 0.45초, 총 ~15초)
    inputProps.timing = buildSceneTiming(
      narrationLines.map((l) => l?.seconds ?? 0)
    );
    console.log(
      `나레이션 ${narrationLines.filter(Boolean).length}/5줄 · ` +
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

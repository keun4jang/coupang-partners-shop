import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Product } from "@/types/db";
import { findMatchingAliVideo, hasAliexpressEnv } from "./aliexpress";
import { findCoupangProductVideo, hasCoupangScraperEnv } from "./coupangVideo";
import { supabaseAdmin } from "./supabase";

/**
 * 상품 영상 완전자동 소싱 오케스트레이터 (렌더 워커 전용 - Node/ffmpeg 사용).
 *
 * 우선순위:
 *  ① 캐시 - 이 상품으로 전에 찾아둔 영상 (products.source_video_url)
 *  ② 쿠팡 상세영상 - 그 상품 페이지의 판매자 시연 영상 (SCRAPER_PROXY_URL 필요)
 *  ③ 알리 매칭 - 키워드 검색 + 이미지 지문 대조로 "같은 제품" 판매자 데모 영상
 *  ④ (호출부 폴백) Pexels 카테고리 스톡
 *
 * 채택된 영상은 자동 가공: 다운로드 → 길이/해상도 검사 → 앞·중간·뒤 고르게
 * 3~4초 세그먼트 N개 추출 → 가장자리 크롭(워터마크 제거) → broll 파일로 저장.
 * 모든 단계는 실패해도 조용히 다음 단계로 넘어간다 (영상 생산을 막지 않음).
 */

const BROLL_DIR = path.resolve("public/assets/broll");
/** 소스 영상 최소 길이(초) - 이보다 짧으면 세그먼트를 못 뽑아 폴백 */
const MIN_SOURCE_SECONDS = 8;
/** 소스 영상 최소 가로 해상도 - 저화질 배경 방지 */
const MIN_WIDTH = 500;
/** 세그먼트 하나 길이(초) - 장면(2~4초)을 여유 있게 덮는다 */
const SEGMENT_SECONDS = 4.5;
/** 가장자리 크롭 비율 - 모서리 워터마크/자막 제거용 (86%만 남김) */
const EDGE_KEEP = 0.86;
/** 다운로드 용량 상한 */
const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;

export interface SourcedClips {
  /** public/assets/broll/ 기준 파일명 목록 (비어있으면 소싱 실패 → 스톡 폴백) */
  files: string[];
  /** 어디서 온 영상인지 (텔레그램 알림에 표기) */
  origin: string;
}

/** Remotion 내장 ffmpeg/ffprobe 실행 */
function runFf(tool: "ffmpeg" | "ffprobe", args: string[]): string {
  return execFileSync("npx", ["remotion", tool, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
  });
}

function probeVideo(
  localPath: string
): { duration: number; width: number; height: number } | null {
  try {
    const out = runFf("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      localPath,
    ]);
    const data = JSON.parse(out) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const duration = parseFloat(data.format?.duration ?? "0");
    const width = data.streams?.[0]?.width ?? 0;
    const height = data.streams?.[0]?.height ?? 0;
    if (!duration || !width) return null;
    return { duration, width, height };
  } catch (e) {
    console.warn(`ffprobe 실패: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

async function downloadVideo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_DOWNLOAD_BYTES) return false;
    fs.writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * 로컬 영상 파일 → broll 세그먼트 N개 추출 (공통 코어).
 * 실패하거나 품질 기준 미달이면 빈 배열.
 */
export function segmentLocalVideo(
  localPath: string,
  count: number,
  outPrefix: string,
  opts?: {
    minSeconds?: number;
    /** 끝에서 이만큼(초)을 무조건 버린다 - 도우인 앱 다운로드 영상의 홍보 아웃트로 컷 제거용 */
    tailTrimSeconds?: number;
  }
): string[] {
  const minSeconds = opts?.minSeconds ?? MIN_SOURCE_SECONDS;
  const info = probeVideo(localPath);
  if (!info) return [];
  if (info.duration < minSeconds || info.width < MIN_WIDTH) {
    console.warn(
      `소스 영상 품질 미달 (${info.duration.toFixed(1)}s, ${info.width}px) - 건너뜀`
    );
    return [];
  }

  // 앞 5% / 뒤 5%는 버리고(인트로·아웃트로 로고 방지) 고르게 count 개 추출.
  // tailTrimSeconds 가 있으면 뒤쪽은 그만큼(최소 5%)을 잘라낸다.
  fs.mkdirSync(BROLL_DIR, { recursive: true });
  const segLen = Math.min(SEGMENT_SECONDS, Math.max(2, info.duration * 0.9));
  const tailTrim = Math.max(info.duration * 0.05, opts?.tailTrimSeconds ?? 0);
  const usableFrom = info.duration * 0.05;
  const usableTo = info.duration - tailTrim - segLen;
  const n = Math.max(1, count);
  const files: string[] = [];
  for (let i = 0; i < n; i++) {
    const start =
      usableTo > usableFrom
        ? usableFrom + ((usableTo - usableFrom) * i) / Math.max(1, n - 1)
        : usableFrom;
    const name = `${outPrefix}-${i}.mp4`;
    try {
      runFf("ffmpeg", [
        "-ss",
        start.toFixed(2),
        "-i",
        localPath,
        "-t",
        String(segLen),
        "-vf",
        // 가장자리 크롭(워터마크 제거) 후 세로 1280 기준으로 축소
        `crop=iw*${EDGE_KEEP}:ih*${EDGE_KEEP},scale=-2:1280`,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "25",
        "-y",
        path.join(BROLL_DIR, name),
      ]);
      files.push(name);
    } catch (e) {
      console.warn(`세그먼트 ${i} 추출 실패: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  // 일부만 성공해도 사용 (1개면 전 장면에 반복 사용됨)
  return files;
}

/**
 * 소스 영상 URL → broll 세그먼트 N개 추출.
 * 실패하거나 품질 기준 미달이면 빈 배열 (호출부 폴백).
 */
export async function segmentRemoteVideo(
  videoUrl: string,
  displayNumber: number,
  count: number
): Promise<string[]> {
  const tmp = path.join(os.tmpdir(), `source-${displayNumber}.mp4`);
  try {
    if (!(await downloadVideo(videoUrl, tmp))) {
      console.warn("소스 영상 다운로드 실패");
      return [];
    }
    return segmentLocalVideo(tmp, count, `src${displayNumber}`);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // 무시
    }
  }
}

/* ── 스튜디오: 직접 업로드 소재 (Storage 'footage' 버킷) ─────────────── */

const FOOTAGE_BUCKET = "footage";
/** 직접 올린 영상은 사용자가 이미 골라온 것이라 길이 기준을 느슨하게 (3초 이상) */
const FOOTAGE_MIN_SECONDS = 3;

/** 도우인 앱 다운로드 영상 끝의 홍보/링크 아웃트로 컷 길이 추정 (영상 길이별) */
function douyinTailTrim(durationSec: number): number {
  if (durationSec >= 12) return 4;
  if (durationSec >= 8) return 3;
  return 1;
}

/**
 * 업로드된 footage 영상들 → broll 세그먼트 (총 totalCount 개를 파일들에 고르게 배분).
 * 예) 파일 1개 → 그 영상에서 4컷 / 파일 2개 → 각 2컷 / 4개 이상 → 각 1컷.
 * 도우인 아웃트로(끝 홍보 컷)는 잘라내고, 중국어 자막/글자는 OCR로 찾아 지운다.
 * 전부 실패하면 빈 배열 (호출부가 스톡으로 폴백).
 */
export async function segmentsFromFootage(
  storagePaths: string[],
  displayNumber: number,
  totalCount: number
): Promise<string[]> {
  const db = supabaseAdmin();
  const usable = storagePaths.slice(0, totalCount);
  const per = Math.ceil(totalCount / usable.length);

  const files: string[] = [];
  try {
    for (let fi = 0; fi < usable.length && files.length < totalCount; fi++) {
      const storagePath = usable[fi];
      const tmp = path.join(os.tmpdir(), `footage-${displayNumber}-${fi}.mp4`);
      try {
        const { data, error } = await db.storage
          .from(FOOTAGE_BUCKET)
          .download(storagePath);
        if (error || !data) {
          console.warn(`footage 다운로드 실패 (${storagePath}): ${error?.message}`);
          continue;
        }
        fs.writeFileSync(tmp, Buffer.from(await data.arrayBuffer()));
        const info = probeVideo(tmp);
        const want = Math.min(per, totalCount - files.length);
        const got = segmentLocalVideo(tmp, want, `ftg${displayNumber}-${fi}`, {
          minSeconds: FOOTAGE_MIN_SECONDS,
          tailTrimSeconds: info ? douyinTailTrim(info.duration) : 0,
        });
        // 중국어 텍스트 지우기 (OCR 감지 - 실패해도 세그먼트는 그대로 사용)
        for (const name of got) {
          await removeChineseText(path.join(BROLL_DIR, name));
        }
        files.push(...got);
      } catch (e) {
        console.warn(
          `footage 처리 실패 (${storagePath}): ${(e as Error).message.slice(0, 150)}`
        );
      } finally {
        try {
          fs.unlinkSync(tmp);
        } catch {
          // 무시
        }
      }
    }
  } finally {
    await shutdownOcr();
  }
  return files;
}

/* ── 중국어 텍스트 자동 제거 (OCR + delogo) ──────────────────────────
 * 도우인 영상엔 중국어 자막/스티커가 박혀 있는 경우가 많다.
 * 세그먼트별로 프레임 3장을 뽑아 tesseract(chi_sim) OCR 로 중국어 글자 영역을 찾고,
 * 시스템 ffmpeg 의 delogo 필터로 주변 픽셀 보간(=글자 지움) 처리한다.
 * - Remotion 내장 ffmpeg 는 필터가 잘려 있어 delogo 가 없다 → 시스템 ffmpeg 사용
 *   (GitHub Actions ubuntu 러너에 기본 설치돼 있음). 없으면 조용히 생략.
 * - OCR/지우기 실패는 치명적이지 않다 - 원본 세그먼트 그대로 사용.
 */

interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 시스템 ffmpeg (풀 필터판) 경로 - 없으면 null */
let systemFfmpegChecked: string | null | undefined;
function systemFfmpeg(): string | null {
  if (systemFfmpegChecked !== undefined) return systemFfmpegChecked;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10_000 });
    systemFfmpegChecked = "ffmpeg";
  } catch {
    systemFfmpegChecked = null;
  }
  return systemFfmpegChecked;
}

// tesseract.js 워커는 무겁고 스레드를 잡고 있으므로 배치당 1개만 만들고 재사용한다.
// (terminate 하지 않으면 Node 프로세스가 안 끝난다 - shutdownOcr 필수)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tessWorker: any | null = null;
// PSM 모드 상수 (tesseract.js PSM enum 값)
const PSM_AUTO = "3";
const PSM_SPARSE = "11";
async function getOcrWorker() {
  if (!tessWorker) {
    const { createWorker } = await import("tesseract.js");
    tessWorker = await createWorker("chi_sim", 1, {
      cachePath: path.join(os.tmpdir(), "tess-cache"),
    });
  }
  return tessWorker;
}

/** OCR 워커 정리 (footage 배치 종료 시 호출 - 안 하면 워커 프로세스가 안 죽음) */
export async function shutdownOcr(): Promise<void> {
  if (tessWorker) {
    try {
      await tessWorker.terminate();
    } catch {
      // 무시
    }
    tessWorker = null;
  }
}

const CJK_RE = /[一-鿿]/g;
/** 지울 영역 최대 개수 (과도한 delogo 는 화면을 망가뜨림) */
const MAX_BOXES = 10;
const BOX_PAD = 8;
/** OCR 정확도용 프레임 확대 배율 (저해상도에선 자막 인식률이 뚝 떨어진다) */
const OCR_UPSCALE = 2;

/**
 * TSV(level 5 = 단어) 파싱 → "줄 단위" 판정.
 * 글자별 신뢰도로 거르면 자막 일부 글자만 지워져 반쪽이 남으므로,
 * 줄로 묶은 뒤 (중국어 2자 이상 + 최고 신뢰도 55 이상)이면 줄 전체를 지운다.
 * 중국어 1자짜리 줄은 오탐이 많아 신뢰도 78 이상일 때만 인정.
 */
function parseTsvBoxes(tsv: string): Array<TextBox & { line: string }> {
  interface Word extends TextBox {
    conf: number;
    text: string;
  }
  const byLine = new Map<string, Word[]>();
  for (const row of tsv.split("\n")) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const text = c[11]?.trim() ?? "";
    if (!text) continue;
    const key = `${c[2]}-${c[3]}-${c[4]}`;
    const list = byLine.get(key) ?? [];
    list.push({
      x: parseInt(c[6], 10),
      y: parseInt(c[7], 10),
      w: parseInt(c[8], 10),
      h: parseInt(c[9], 10),
      conf: parseFloat(c[10]),
      text,
    });
    byLine.set(key, list);
  }

  const out: Array<TextBox & { line: string }> = [];
  for (const [key, words] of byLine) {
    const joined = words.map((w) => w.text).join("");
    // 선반/문틀 모서리가 一·二·口 같은 획 글자로 오인되는 노이즈가 많다
    // → "의미 있는" 중국어 글자 수는 구조 획 글자를 빼고 센다
    const cjkAll = joined.match(CJK_RE) ?? [];
    const cjkMeaningful = cjkAll.filter((ch) => !"一二三十口丨田".includes(ch));
    const maxConf = Math.max(...words.map((w) => w.conf));
    const ok =
      (cjkMeaningful.length >= 2 && maxConf >= 55) ||
      (cjkMeaningful.length === 1 && maxConf >= 78);
    if (!ok) continue;
    // 줄 상자 = 그 줄 모든 단어의 합집합 (저신뢰 글자도 같이 지움)
    let box: TextBox | null = null;
    for (const w of words) box = box ? unionBox(box, w) : { x: w.x, y: w.y, w: w.w, h: w.h };
    if (box) out.push({ ...box, line: key });
  }
  return out;
}

/** 두 상자를 합친 상자 */
function unionBox(a: TextBox, b: TextBox): TextBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** 겹치거나 거의 붙어 있는 상자인지 (여백 16px 확장 후 교차 검사) */
function boxesTouch(a: TextBox, b: TextBox): boolean {
  const m = 16;
  return !(
    a.x + a.w + m < b.x ||
    b.x + b.w + m < a.x ||
    a.y + a.h + m < b.y ||
    b.y + b.h + m < a.y
  );
}

/**
 * 상자 병합 2단계:
 * ① 같은 프레임의 같은 줄 단어들 → 줄 상자 1개
 * ② 프레임이 달라도 겹치는 상자들(같은 자막이 3프레임에 반복 검출됨) → 1개로 통합
 *    (안 합치면 중복이 MAX_BOXES 상한을 잡아먹어 정작 다른 자막을 못 지운다)
 */
function mergeLineBoxes(
  words: Array<TextBox & { line: string }>,
  width: number,
  height: number
): TextBox[] {
  const byLine = new Map<string, TextBox>();
  for (const wd of words) {
    const cur = byLine.get(wd.line);
    byLine.set(wd.line, cur ? unionBox(cur, wd) : { ...wd });
  }

  // ② 기하학적 통합 - 더 이상 합칠 게 없을 때까지 반복
  let boxes = [...byLine.values()];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxesTouch(boxes[i], boxes[j])) {
          boxes[i] = unionBox(boxes[i], boxes[j]);
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  // 패딩 + 프레임 경계 클램프 (delogo 는 경계 밖이면 에러)
  return boxes
    .map((b) => {
      const x = Math.max(1, b.x - BOX_PAD);
      const y = Math.max(1, b.y - BOX_PAD);
      const w = Math.min(width - 1 - x, b.w + BOX_PAD * 2);
      const h = Math.min(height - 1 - y, b.h + BOX_PAD * 2);
      return { x, y, w, h };
    })
    .filter((b) => b.w >= 8 && b.h >= 8);
}

/**
 * 세그먼트에서 중국어 글자 영역을 찾아 지운다 (제자리 덮어쓰기).
 * 프레임 3장을 샘플해 상자를 합치므로, 자막이 바뀌어도 나온 적 있는 영역은 다 지워진다.
 */
export async function removeChineseText(segmentPath: string): Promise<void> {
  const ff = systemFfmpeg();
  if (!ff) {
    console.warn("시스템 ffmpeg 없음 - 중국어 지우기 생략");
    return;
  }
  try {
    const info = probeVideo(segmentPath);
    if (!info) return;

    // 프레임 3장 샘플(2배 확대 - OCR 인식률) → OCR → 상자 수집
    const worker = await getOcrWorker();
    const allWords: Array<TextBox & { line: string }> = [];
    const sampleTimes = [0.3, Math.min(2.2, info.duration / 2), Math.max(0.5, info.duration - 0.6)];
    for (let i = 0; i < sampleTimes.length; i++) {
      const framePath = path.join(os.tmpdir(), `ocr-${path.basename(segmentPath)}-${i}.png`);
      try {
        execFileSync(
          ff,
          [
            "-ss", sampleTimes[i].toFixed(2),
            "-i", segmentPath,
            "-vf", `scale=iw*${OCR_UPSCALE}:ih*${OCR_UPSCALE}:flags=lanczos`,
            "-frames:v", "1", "-y", framePath,
          ],
          { stdio: "ignore", timeout: 60_000 }
        );
        // 두 PSM 모드로 인식해 합친다 - AUTO 는 문단형 자막, SPARSE 는 산발 스티커에 강함
        for (const psm of [PSM_AUTO, PSM_SPARSE]) {
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          const { data } = await worker.recognize(framePath, {}, { tsv: true });
          // 확대 좌표 → 원본 좌표. 프레임/모드마다 line 키가 겹칠 수 있어 접두사를 섞는다
          allWords.push(
            ...parseTsvBoxes(data.tsv ?? "").map((b) => ({
              x: Math.round(b.x / OCR_UPSCALE),
              y: Math.round(b.y / OCR_UPSCALE),
              w: Math.round(b.w / OCR_UPSCALE),
              h: Math.round(b.h / OCR_UPSCALE),
              line: `f${i}p${psm}-${b.line}`,
            }))
          );
        }
      } catch (e) {
        console.warn(`OCR 프레임 ${i} 실패: ${(e as Error).message.slice(0, 100)}`);
      } finally {
        try {
          fs.unlinkSync(framePath);
        } catch {
          // 무시
        }
      }
    }

    const boxes = mergeLineBoxes(allWords, info.width, info.height)
      // 자막답지 않은 거대 상자는 오탐 - 화면을 크게 지우면 배경이 망가진다
      .filter((b) => b.h <= info.height * 0.2 && b.w <= info.width * 0.96)
      .slice(0, MAX_BOXES);
    if (boxes.length === 0) return;

    // delogo 체인으로 지우고 제자리 교체
    const vf = boxes.map((b) => `delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}`).join(",");
    const tmpOut = segmentPath.replace(/\.mp4$/, ".clean.mp4");
    execFileSync(
      ff,
      ["-i", segmentPath, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-y", tmpOut],
      { stdio: "ignore", timeout: 180_000 }
    );
    fs.renameSync(tmpOut, segmentPath);
    console.log(
      `중국어 텍스트 ${boxes.length}곳 지움: ${path.basename(segmentPath)} ` +
        boxes.map((b) => `(${b.x},${b.y} ${b.w}x${b.h})`).join(" ")
    );
  } catch (e) {
    console.warn(`중국어 지우기 실패(원본 유지): ${(e as Error).message.slice(0, 150)}`);
  }
}

/** 렌더·업로드 성공 후 스토리지의 footage 원본 삭제 (용량 관리, best-effort) */
export async function deleteFootageFiles(storagePaths: string[]): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .storage.from(FOOTAGE_BUCKET)
      .remove(storagePaths);
    if (error) console.warn(`footage 정리 실패: ${error.message}`);
  } catch (e) {
    console.warn(`footage 정리 실패: ${(e as Error).message.slice(0, 120)}`);
  }
}

/** 소싱 결과를 products 에 캐시 (다음 렌더에서 재검색 생략) */
async function cacheSourceVideo(
  productId: string,
  url: string | null,
  origin: string | null
): Promise<void> {
  try {
    await supabaseAdmin()
      .from("products")
      .update({
        source_video_url: url,
        source_video_origin: origin,
        source_video_checked_at: new Date().toISOString(),
      })
      .eq("id", productId);
  } catch {
    // 캐시 실패는 치명적이지 않음
  }
}

/**
 * 상품 영상 완전자동 소싱 진입점.
 * files 가 비어있으면 호출부가 Pexels 스톡으로 폴백한다.
 */
export async function sourceProductClips(
  product: Product,
  displayNumber: number,
  count: number
): Promise<SourcedClips> {
  // ① 캐시된 소스 영상
  if (product.source_video_url) {
    const files = await segmentRemoteVideo(
      product.source_video_url,
      displayNumber,
      count
    );
    if (files.length > 0) {
      return {
        files,
        origin: product.source_video_origin ?? "캐시된 상품 영상",
      };
    }
    console.warn("캐시된 소스 영상 사용 불가 - 재소싱 시도");
  }

  // ② 쿠팡 상세페이지 판매자 영상 (프록시 설정 시) - 그 상품 자체의 영상이라 최우선
  if (hasCoupangScraperEnv()) {
    try {
      const videoUrl = await findCoupangProductVideo(product.coupang_partner_url);
      if (videoUrl) {
        const files = await segmentRemoteVideo(videoUrl, displayNumber, count);
        if (files.length > 0) {
          const origin = "쿠팡 상세영상";
          await cacheSourceVideo(product.id, videoUrl, origin);
          return { files, origin };
        }
      }
    } catch (e) {
      console.warn(`쿠팡 소싱 실패: ${(e as Error).message.slice(0, 150)}`);
    }
  }

  // ③ 알리익스프레스 이미지 매칭
  if (hasAliexpressEnv() && product.image_url) {
    try {
      const match = await findMatchingAliVideo(
        product.product_name,
        product.image_url
      );
      if (match) {
        const files = await segmentRemoteVideo(
          match.videoUrl,
          displayNumber,
          count
        );
        if (files.length > 0) {
          const origin = `알리 매칭(거리 ${match.distance})`;
          await cacheSourceVideo(product.id, match.videoUrl, origin);
          return { files, origin };
        }
      }
    } catch (e) {
      console.warn(`알리 소싱 실패: ${(e as Error).message.slice(0, 150)}`);
    }
  }

  // ④ 호출부 폴백 (Pexels 스톡)
  return { files: [], origin: "스톡" };
}

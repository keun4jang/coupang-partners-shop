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
    const info = probeVideo(tmp);
    if (!info) return [];
    if (info.duration < MIN_SOURCE_SECONDS || info.width < MIN_WIDTH) {
      console.warn(
        `소스 영상 품질 미달 (${info.duration.toFixed(1)}s, ${info.width}px) - 폴백`
      );
      return [];
    }

    // 앞 5% / 뒤 5%는 버리고(인트로·아웃트로 로고 방지) 고르게 count 개 추출
    fs.mkdirSync(BROLL_DIR, { recursive: true });
    const usableFrom = info.duration * 0.05;
    const usableTo = info.duration * 0.95 - SEGMENT_SECONDS;
    const n = Math.max(1, count);
    const files: string[] = [];
    for (let i = 0; i < n; i++) {
      const start =
        usableTo > usableFrom
          ? usableFrom + ((usableTo - usableFrom) * i) / Math.max(1, n - 1)
          : usableFrom;
      const name = `src${displayNumber}-${i}.mp4`;
      try {
        runFf("ffmpeg", [
          "-ss",
          start.toFixed(2),
          "-i",
          tmp,
          "-t",
          String(SEGMENT_SECONDS),
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
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // 무시
    }
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

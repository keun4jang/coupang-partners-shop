import fs from "fs";
import path from "path";
import { optionalEnv } from "./env";

/**
 * 스톡 실사용 영상(B-roll) 자동 수급 - Pexels API.
 * 포맷 D(실사용 영상 배경)용. 카테고리에 맞는 세로 영상을 검색해
 * public/assets/broll/ 에 내려받고 파일명을 돌려준다.
 *
 * - Pexels 라이선스: 상업 이용 무료, 출처표기 불필요 (pexels.com/license)
 * - PEXELS_API_KEY 없거나 검색 실패 시 null → 호출부가 블러 배경으로 폴백
 */

const PEXELS_SEARCH = "https://api.pexels.com/videos/search";
const BROLL_DIR = path.resolve("public/assets/broll");
/** 우리 영상(15~18초)을 루프 없이 덮을 수 있는 최소 길이 */
const MIN_DURATION_SEC = 16;
const MAX_DURATION_SEC = 60;

/** 카테고리 → Pexels 영어 검색어 (실사용 장면 위주) */
const SEARCH_QUERY_BY_CATEGORY: Record<string, string> = {
  청소템: "cleaning home housework",
  주방템: "kitchen cooking home",
  수납템: "organizing home closet",
  육아생활템: "baby home care",
  차량용품: "car interior cleaning",
  생활템: "housework daily home",
  반려동물: "dog cat home",
  뷰티: "skincare routine",
  자취템: "small apartment home",
  캠핑: "camping outdoor",
};

interface PexelsVideoFile {
  id: number;
  quality: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  duration: number;
  video_files: PexelsVideoFile[];
}

export interface StockBroll {
  /** public/assets/broll/ 기준 파일명 (Background 의 brollFile 로 그대로 사용) */
  file: string;
  /** 클립 길이(초) */
  durationSec: number;
  /** Pexels 영상 id (로그용) */
  pexelsId: number;
}

function pickFile(video: PexelsVideo): PexelsVideoFile | null {
  // 세로(9:16에 가까운) + HD(720~1080 너비) 파일 우선
  const portrait = video.video_files
    .filter((f) => f.height > f.width && f.link)
    .sort((a, b) => {
      // 1080x1920 에 가장 가까운 해상도 우선
      const score = (f: PexelsVideoFile) => Math.abs(f.width - 1080);
      return score(a) - score(b);
    });
  return portrait[0] ?? null;
}

/**
 * 카테고리에 맞는 스톡 실사용 클립을 받아온다.
 * 같은 카테고리를 여러 번 만들어도 다른 클립이 나오도록 검색 결과에서
 * displayNumber 를 시드로 골라 회전시킨다.
 */
export async function fetchStockBroll(
  category: string,
  displayNumber: number
): Promise<StockBroll | null> {
  const apiKey = optionalEnv("PEXELS_API_KEY");
  if (!apiKey) return null;

  const query =
    SEARCH_QUERY_BY_CATEGORY[category] ?? SEARCH_QUERY_BY_CATEGORY["생활템"];

  try {
    const url =
      `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}` +
      `&orientation=portrait&size=medium&per_page=15`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.warn(`Pexels 검색 실패 (${res.status}) - 블러 배경으로 폴백`);
      return null;
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    const candidates = (data.videos ?? []).filter(
      (v) =>
        v.duration >= MIN_DURATION_SEC &&
        v.duration <= MAX_DURATION_SEC &&
        pickFile(v)
    );
    if (candidates.length === 0) {
      console.warn(`Pexels: '${query}' 조건에 맞는 클립 없음 - 블러 배경으로 폴백`);
      return null;
    }

    const video = candidates[displayNumber % candidates.length];
    const file = pickFile(video)!;

    fs.mkdirSync(BROLL_DIR, { recursive: true });
    const filename = `pexels-${video.id}.mp4`;
    const dest = path.join(BROLL_DIR, filename);

    if (!fs.existsSync(dest)) {
      const dl = await fetch(file.link);
      if (!dl.ok) {
        console.warn(`Pexels 다운로드 실패 (${dl.status}) - 블러 배경으로 폴백`);
        return null;
      }
      const buf = Buffer.from(await dl.arrayBuffer());
      // 비정상적으로 크면(>80MB) 렌더 부담이 크니 스킵
      if (buf.length > 80 * 1024 * 1024) {
        console.warn("Pexels 클립이 너무 큼 - 블러 배경으로 폴백");
        return null;
      }
      fs.writeFileSync(dest, buf);
    }

    return { file: filename, durationSec: video.duration, pexelsId: video.id };
  } catch (e) {
    console.warn(`Pexels 처리 실패: ${(e as Error).message} - 블러 배경으로 폴백`);
    return null;
  }
}

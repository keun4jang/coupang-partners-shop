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

/**
 * 카테고리 → Pexels 영어 검색어 변형들.
 * 같은 카테고리 영상이 매번 같은 배경으로 나오지 않도록 여러 변형을 두고
 * 시드로 회전시킨다 (반복 최소화).
 */
const SEARCH_QUERY_BY_CATEGORY: Record<string, string[]> = {
  청소템: [
    "cleaning home housework",
    "wiping kitchen counter home",
    "tidying living room home",
    "mopping floor home",
  ],
  주방템: [
    "kitchen cooking home",
    "preparing food home kitchen",
    "washing dishes home",
    "kitchen counter home",
  ],
  수납템: [
    "organizing home closet",
    "folding clothes home",
    "tidy shelves home",
    "declutter room home",
  ],
  육아생활템: [
    "baby home care",
    "mother with baby home",
    "playing with baby home",
    "baby nursery home",
  ],
  차량용품: [
    "car interior cleaning",
    "car dashboard detail",
    "driving car interior",
    "car seat interior",
  ],
  생활템: [
    "housework daily home",
    "cozy home living",
    "morning routine home",
    "home lifestyle domestic",
  ],
  반려동물: ["dog cat home", "playing pet home", "pet care home"],
  뷰티: ["skincare routine", "beauty vanity home", "morning skincare home"],
  자취템: ["small apartment home", "studio apartment living", "cozy small home"],
  캠핑: ["camping outdoor", "tent camping nature", "outdoor camp cooking"],
};

/**
 * 상품명 키워드 → 더 구체적인 Pexels 영어 검색어.
 * 카테고리보다 우선 적용해 "최대한 제품과 관련있는" 배경 영상을 고른다.
 * (위에서부터 먼저 매칭되는 것을 사용)
 */
const PRODUCT_QUERY_KEYWORDS: Array<[RegExp, string]> = [
  [/기저귀/, "baby diaper changing"],
  [/물티슈/, "wiping cleaning hands baby"],
  [/턱받이|이유식|아기\s*식판/, "baby feeding highchair"],
  [/욕조|목욕/, "baby bath water"],
  [/유모차/, "stroller walk baby"],
  [/세탁|세제|캡슐|섬유유연제/, "laundry washing machine clothes"],
  [/건조대|빨래/, "laundry drying clothes rack"],
  [/밀대|물걸레|대걸레|걸레/, "mopping floor cleaning home"],
  [/테이프\s*클리너|롤러|먼지떨이|먼지/, "lint roller cleaning sofa"],
  [/청소솔|브러쉬|브러시|수세미/, "scrubbing cleaning brush"],
  [/락스|폼스프레이|욕실|변기|타일/, "bathroom cleaning spray tiles"],
  [/청소기/, "vacuum cleaning floor home"],
  [/선반|거치대|정리함|수납|리빙\s*박스|리빙박스|옷정리|정리|박스/, "organizing storage boxes home"],
  [/전자레인지|밥솥|에어프라이어/, "kitchen counter appliance home"],
  [/주걱|국자|뒤집개|조리도구|프라이팬|후라이팬|냄비|도마|칼/, "cooking kitchen utensils home"],
  [/드라이기|헤어/, "hair dryer bathroom vanity"],
  [/텀블러|물병|컵/, "pouring water drink kitchen"],
  [/차량|자동차|차\s/, "car interior clean"],
];

/** 상품명 키워드에 맞는 구체 검색어 (없으면 null) */
function productQuery(productName: string): string | null {
  const name = productName ?? "";
  for (const [re, q] of PRODUCT_QUERY_KEYWORDS) {
    if (re.test(name)) return q;
  }
  return null;
}

/** 카테고리 검색어 변형들 */
function categoryQueries(category: string): string[] {
  return SEARCH_QUERY_BY_CATEGORY[category] ?? SEARCH_QUERY_BY_CATEGORY["생활템"];
}

/**
 * 생활감 보정: 산업/상업 시설 장면(공장 세탁실, 업소 주방 등)이 걸리지 않도록
 * 집안 장면이 어울리는 검색어에는 "home domestic" 힌트를 강제한다.
 * (10번 영상에서 세탁세제 배경이 산업용 세탁공장으로 나온 문제의 재발 방지)
 */
const NON_HOME_QUERY = /\b(car|camping|outdoor|stroller)\b/;
function domesticize(query: string): string {
  if (NON_HOME_QUERY.test(query)) return query;
  const withHome = query.includes("home") ? query : `${query} home`;
  return withHome.includes("domestic") ? withHome : `${withHome} domestic`;
}

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

async function downloadClip(
  link: string,
  filename: string
): Promise<string | null> {
  fs.mkdirSync(BROLL_DIR, { recursive: true });
  const dest = path.join(BROLL_DIR, filename);
  if (fs.existsSync(dest)) return filename;
  const dl = await fetch(link);
  if (!dl.ok) return null;
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length > 80 * 1024 * 1024) return null;
  fs.writeFileSync(dest, buf);
  return filename;
}

/**
 * Pixabay 대안 소스 (PIXABAY_API_KEY).
 * 세로 필터가 없어 가로 클립도 나올 수 있지만 배경이 cover 크롭이라 문제 없음.
 * 라이선스: 상업 무료·출처표기 불필요 (pixabay.com/service/license-summary)
 */
async function fetchFromPixabay(
  query: string,
  seed: number
): Promise<StockBroll | null> {
  const apiKey = optionalEnv("PIXABAY_API_KEY");
  if (!apiKey) return null;
  const page = 1 + (Math.abs(seed) % PAGE_SPREAD);
  const url =
    `https://pixabay.com/api/videos/?key=${apiKey}` +
    `&q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Pixabay 검색 실패 (${res.status})`);
    return null;
  }
  const data = (await res.json()) as {
    hits?: Array<{
      id: number;
      duration: number;
      videos: Record<string, { url: string; width: number; height: number }>;
    }>;
  };
  const candidates = (data.hits ?? []).filter(
    (v) => v.duration >= MIN_DURATION_SEC && v.duration <= MAX_DURATION_SEC
  );
  if (candidates.length === 0) return null;
  const video = candidates[Math.abs(seed) % candidates.length];
  // 세로 파일 우선, 없으면 큰 해상도(가로여도 cover 크롭)
  const files = Object.values(video.videos).filter((f) => f.url);
  const portrait = files.filter((f) => f.height > f.width);
  const pick =
    portrait.sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080))[0] ??
    files.sort((a, b) => b.height - a.height)[0];
  if (!pick) return null;
  const filename = await downloadClip(pick.url, `pixabay-${video.id}.mp4`);
  if (!filename) return null;
  return { file: filename, durationSec: video.duration, pexelsId: video.id };
}

/**
 * 카테고리에 맞는 스톡 실사용 클립을 받아온다.
 * Pexels 우선, 없으면 Pixabay. 같은 카테고리를 여러 번 만들어도
 * 다른 클립이 나오도록 displayNumber 를 시드로 회전시킨다.
 */
/** 검색 결과 상위 몇 페이지에서 회전할지 (Pexels 는 결과가 수천 건이라 깊게 파도 됨) */
const PAGE_SPREAD = 6;
const PER_PAGE = 30;

async function fetchFromPexels(
  query: string,
  seed: number
): Promise<StockBroll | null> {
  const apiKey = optionalEnv("PEXELS_API_KEY");
  if (!apiKey) return null;

  // 시드로 페이지를 회전 → 항상 상위 50개만 쓰지 않고 수백 개 풀에서 고름 (반복 방지)
  const page = 1 + (Math.abs(seed) % PAGE_SPREAD);
  const url =
    `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&size=medium&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    console.warn(`Pexels 검색 실패 (${res.status})`);
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
    return null;
  }

  const video = candidates[Math.abs(seed) % candidates.length];
  const file = pickFile(video)!;
  const filename = await downloadClip(file.link, `pexels-${video.id}.mp4`);
  if (!filename) {
    console.warn("Pexels 다운로드 실패/용량 초과");
    return null;
  }
  return { file: filename, durationSec: video.duration, pexelsId: video.id };
}

export async function fetchStockBroll(
  category: string,
  displayNumber: number
): Promise<StockBroll | null> {
  const list = await fetchStockBrolls(category, displayNumber, 1);
  return list[0] ?? null;
}

/**
 * 서로 다른 스톡 클립 여러 개를 받아온다 (포맷 D 의 4컷 배경용).
 * displayNumber 를 시드로 서로 다른 후보를 회전 선택.
 * 구할 수 있는 만큼만 돌려준다 (0개면 블러 배경 폴백).
 */
type Provider = {
  name: string;
  fetch: (query: string, seed: number) => Promise<StockBroll | null>;
};

/** 키가 설정된 스톡 제공자만 활성화 (Pexels · Pixabay). */
function activeProviders(): Provider[] {
  const list: Provider[] = [];
  if (optionalEnv("PEXELS_API_KEY")) list.push({ name: "Pexels", fetch: fetchFromPexels });
  if (optionalEnv("PIXABAY_API_KEY")) list.push({ name: "Pixabay", fetch: fetchFromPixabay });
  return list;
}

export async function fetchStockBrolls(
  category: string,
  displayNumber: number,
  count: number,
  productName = ""
): Promise<StockBroll[]> {
  // 검색어 풀: 상품명 특화 검색어(있으면) + 카테고리 변형들. 모두 생활감 보정.
  const pq = productQuery(productName);
  const rawQueries = [...(pq ? [pq] : []), ...categoryQueries(category)];
  const queries = [...new Set(rawQueries.map(domesticize))];

  const providers = activeProviders();
  if (providers.length === 0) {
    console.warn("스톡 API 키 없음 - 블러 상품사진 배경으로 폴백");
    return [];
  }
  console.log(
    `스톡 검색어 ${queries.length}종 × 제공자 ${providers
      .map((p) => p.name)
      .join("+")} (상품: ${productName || category})`
  );

  const out: StockBroll[] = [];
  const seen = new Set<string>();
  // 슬롯마다 (검색어 · 제공자 · 시드)를 회전시켜 서로 다른 장면/소스가 섞이게 한다.
  const maxAttempts = count * 4 + 8;
  for (let attempt = 0; out.length < count && attempt < maxAttempts; attempt++) {
    const query = queries[attempt % queries.length];
    const provider = providers[attempt % providers.length];
    const seed = displayNumber * 101 + attempt * 17;
    try {
      const clip = await provider.fetch(query, seed);
      if (clip && !seen.has(clip.file)) {
        seen.add(clip.file);
        out.push(clip);
      }
    } catch (e) {
      console.warn(`${provider.name} 처리 실패: ${(e as Error).message}`);
    }
  }

  if (out.length === 0) {
    console.warn("스톡 클립 수급 실패 - 블러 상품사진 배경으로 폴백");
  } else {
    console.log(`스톡 클립 ${out.length}개: ${out.map((c) => c.file).join(", ")}`);
  }
  return out;
}

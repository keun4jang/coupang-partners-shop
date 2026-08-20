import fs from "fs";
import path from "path";
import { optionalEnv } from "./env";
import { getSetting } from "./settings";

/** 스톡 API 키: 환경변수 우선, 없으면 Supabase app_settings (배포/시크릿 편집 없이 갱신) */
async function resolveKey(name: string): Promise<string | undefined> {
  return optionalEnv(name) ?? (await getSetting(name)) ?? undefined;
}

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
/**
 * 스톡 클립 최소 길이.
 *
 * 예전 16초는 "영상 전체를 클립 하나로 덮던 시절"의 값이다. 지금 포맷 D 는
 * 4컷으로 나눠 각 클립이 5~12초 구간만 담당하고, Background 의 OffthreadVideo 가
 * loop 로 이어 붙이므로 짧아도 정지화면이 되지 않는다.
 *
 * 실측(2026-08-05, Pexels 세로 30건 기준): 16초 이상만 받으면 후보가
 * "scrubbing cleaning brush" 5건 / "organizing storage boxes" 6건까지 줄어드는데,
 * 8초 이상으로 낮추면 각각 29건 / 28건으로 늘어난다. 후보가 적으면 같은 배경이
 * 반복되고, 검색이 아예 실패해 블러 배경으로 떨어지는 일도 잦아진다.
 */
const MIN_DURATION_SEC = 8;
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
    // "cozy home living" 같은 분위기 검색어는 Pixabay 에서 AI 생성 오두막·
    // 벽난로 클립이 상위에 온다(실측 2026-08-16: 상위 5개 중 4개 ai generated).
    // 구체적인 집안일 동작으로 좁혀야 실사용 장면이 나온다.
    "housework daily home",
    "wiping table home",
    "morning routine home",
    "tidying living room home",
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
  // 차량템은 맨 앞에 둔다. 뒤에 두면 "차량용 미니 청소기"가 아래 /청소기/ 규칙에
  // 먼저 걸려 집안 바닥 청소기 영상이 배경으로 깔린다(실측 확인).
  // 같은 이유로 "차량용 방향제 거치대"는 /거치대/ 에, "자동차 트렁크 정리함"은
  // /정리함/ 에 잡혔다.
  [/차량|자동차|차량용|트렁크|대시보드/, "car interior clean"],
  [/기저귀/, "baby diaper changing"],
  [/물티슈/, "wiping cleaning hands baby"],
  [/턱받이|이유식|아기\s*식판/, "baby feeding highchair"],
  [/욕조|목욕/, "baby bath water"],
  [/유모차/, "stroller walk baby"],
  // 식기류는 건조대/세탁 규칙보다 앞에 둔다. 뒤에 두면 "식기 건조대"가
  // /건조대/ 에 걸려 빨래 배경이 깔리고, "면그릇"은 아무 규칙에도 안 걸려
  // 카테고리 폴백으로 떨어진다(실측: 107번 도자기 면그릇에 산속 오두막 배경).
  // 검색어는 세로 재고가 확인된 것만 쓴다(Pexels "washing dishes" 4,453건,
  // Pixabay 는 설거지 세로가 0건이라 이 규칙은 사실상 Pexels 전용).
  [/그릇|접시|식기|면기|국그릇|밥그릇|수저|젓가락|숟가락/, "washing dishes home"],
  [/세탁|세제|캡슐|섬유유연제/, "laundry washing machine clothes"],
  [/건조대|빨래/, "laundry drying clothes rack"],
  [/밀대|물걸레|대걸레|걸레/, "mopping floor cleaning home"],
  [/테이프\s*클리너|롤러|먼지떨이|먼지/, "lint roller cleaning sofa"],
  [/청소솔|브러쉬|브러시|수세미/, "scrubbing cleaning brush"],
  // "배스룸 폼 클리너"(115번)가 어느 규칙에도 안 걸려 버섯 손질·폰 보는 영상이
  // 깔렸다. 외래어 표기(배스룸)와 "폼/욕실 클리너" 조합도 잡는다.
  [/락스|폼\s*스프레이|폼\s*클리너|배스룸|욕실|변기|타일/, "bathroom cleaning spray tiles"],
  [/청소기/, "vacuum cleaning floor home"],
  [/선반|거치대|정리함|수납|리빙\s*박스|리빙박스|옷정리|정리|박스/, "organizing storage boxes home"],
  [/전자레인지|밥솥|에어프라이어/, "kitchen counter appliance home"],
  [/주걱|국자|뒤집개|조리도구|프라이팬|후라이팬|냄비|도마|칼/, "cooking kitchen utensils home"],
  [/드라이기|헤어/, "hair dryer bathroom vanity"],
  [/텀블러|물병|컵/, "pouring water drink kitchen"],
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
 * 집안 장면이 어울리는 검색어에 "home" 힌트를 강제한다.
 * (10번 영상에서 세탁세제 배경이 산업용 세탁공장으로 나온 문제의 재발 방지)
 *
 * 예전엔 "domestic" 도 함께 붙였는데 실측 결과 빼는 게 낫다(2026-08-05):
 *  - Pexels(주력): 붙이든 안 붙이든 총 결과가 8000 으로 같다. 산업 장면을 걸러내는
 *    효과는 없고 상위 랭킹만 흔들었다.
 *  - Pixabay: 태그 매칭이라 domestic 이 "domestic cat/animal" 에 걸린다. 게다가
 *    세로 후보를 오히려 줄였다("organizing home closet" 기준 1개 → 0개).
 */
const NON_HOME_QUERY = /\b(car|camping|outdoor|stroller)\b/;
function domesticize(query: string): string {
  if (NON_HOME_QUERY.test(query)) return query;
  return query.includes("home") ? query : `${query} home`;
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
  /** 영상 페이지 URL - 슬러그에 내용 설명이 들어 있어 무관 클립 필터에 쓴다
      (예: .../video/aerial-view-of-forest-9472839/). Pexels 는 태그를 안 준다. */
  url?: string;
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

/**
 * 클립 방향. 포맷 D 는 전면 세로 배경이라 portrait,
 * 포맷 E 는 카드 안 16:9 가로 창이라 landscape 를 쓴다
 * (가로 창에 세로 클립을 cover 크롭하면 원본의 가운데 1/3 띠만 보인다).
 */
export type StockOrientation = "portrait" | "landscape";

function pickFile(
  video: PexelsVideo,
  orientation: StockOrientation
): PexelsVideoFile | null {
  // 요청 방향 + HD 근처 해상도 파일 우선 (세로 1080폭 / 가로 1280폭 목표)
  const targetWidth = orientation === "portrait" ? 1080 : 1280;
  const match = video.video_files
    .filter(
      (f) =>
        f.link &&
        (orientation === "portrait" ? f.height > f.width : f.width > f.height)
    )
    .sort(
      (a, b) => Math.abs(a.width - targetWidth) - Math.abs(b.width - targetWidth)
    );
  return match[0] ?? null;
}

/**
 * 살림템 배경으로 못 쓰는 클립 판별 - 태그(Pixabay)나 URL 슬러그(Pexels)로 거른다.
 *
 * 실측(107번): "cozy home living" 폴백 검색이 mountains/cabin/forest 태그의
 * 산속 오두막 클립을 돌려줘 도자기 그릇 영상 배경에 깔렸다. 동물 태그만 막고
 * 풍경·AI 생성물은 안 막고 있었다.
 *
 * 캠핑/차량 검색어는 야외 장면이 정답이므로 풍경 필터를 건너뛴다.
 */
const ANIMAL_WORDS =
  /\b(cat|dog|pet|animal|kitten|puppy|bird|fish|snail|mollusk|insect|bug|spider|butterfly|bee|ant|worm|turtle|hamster|rabbit|wildlife)\b/i;
const SCENERY_WORDS =
  /\b(mountain|mountains|forest|woods|cabin|hut|lake|river|ocean|sea|beach|waterfall|snow|winter|sunset|sunrise|sky|clouds|drone|aerial|landscape|scenery|nature|travel|island|desert|field|meadow)\b/i;
const SYNTHETIC_WORDS =
  /ai.generated|\b(anime|cartoon|animation|lofi|3d|render|fireplace|abstract|kaleidoscope|fractal|geometric|symmetry|glitch|particles?|hologram|neon|visuali[sz]er)\b/i;
/** 살림 실사용 장면이 될 수 없는 소재 (종교·명절 장식, 향 연출 등) - 항상 제외.
 *  실측(115번 가로 소싱): "tile" 검색에 geometric 모션그래픽이,
 *  "home" 계열 검색에 ramadan/incense 향로 클립이 배경으로 뽑혔다. */
const OFFTOPIC_WORDS =
  /\b(ramadan|ramadhan|mubarak|islamic|spiritual|worship|temple|church|christmas|halloween|easter|diwali|incense|meditation|yoga|zen)\b/i;
/** 음식·조리 장면 - 요리 의도가 없는 검색어에서만 제외.
 *  실측(115번): 청소템 검색어 "wiping kitchen counter home" 이 Pixabay 태그
 *  kitchen 에 걸려 치킨 튀기는 클립을 욕실 세정제 배경으로 가져왔다.
 *  주방템의 "kitchen cooking home" 류 검색어는 음식 장면이 정답이므로 허용. */
const FOOD_WORDS =
  /\b(food|cooking|cooked?|frying|fried|baking|baked|recipe|meal|schnitzel|grill|barbecue|bbq|chef|dough|breakfast|dinner|lunch|delicious|tea|coffee|beverage|juice|wine|beer|cocktail|cafe)\b/i;

/**
 * 집안일 "동작" 신호. 아래 사무실·인물 필터의 예외로 쓴다 -
 * 사람이 나와도 "청소하는 사람"이면 그게 바로 우리가 원하는 실사용 장면이다.
 *
 * 명사(storage·shelf·kitchen·bathroom·hygiene 등)는 일부러 뺐다. 무관 클립의
 * 태그에 흔히 섞여서 예외가 통째로 열리기 때문이다 - 실측 2026-08-20:
 * 'cloud, technology, computer, business, storage'(데이터센터 모션그래픽)가
 * storage 한 단어로, 'man, student, library, shelves, study'(도서관)가 shelves 로,
 * 묘지 클립이 hygiene 으로 사무실·인물 필터를 우회해 통과했다.
 * 그래서 -ing 형 동작 단어만 남긴다.
 */
const CHORE_WORDS =
  /\b(cleaning|cleaner|cleanup|cleans|washing|washes|wiping|wipes|mopping|vacuuming|scrubbing|sweeping|dusting|dishwashing|laundry|housework|housekeeping|chores|tidying|organizing|decluttering|folding|ironing|disinfecting|sanitizing)\b/i

/**
 * 사무실·업무 장면. 살림템 영상에 노트북 치는 사람이 깔리면 완전히 겉돈다
 * (실측 2026-08-20: 욕실 세정제 배경에 keyboard/laptop/office/desk 클립,
 *  home/work/business/money/finance 클립이 그대로 통과했다).
 * 책상·사무용품 검색어일 때는 사무실 장면이 정답이므로 예외를 둔다.
 */
const OFFICE_WORDS =
  /\b(office|workspace|workplace|desk|laptop|computer|keyboard|monitor|meeting|business|businessman|businesswoman|corporate|coworking|startup|conference|presentation|typing|employee|colleague|manager|interview|briefcase|whiteboard|seminar|lecture|classroom|student|study|finance|money|cash|banking|invest\w*|work)\b/i;

/**
 * 제품과 무관한 "그냥 사람" 연출 컷 (인물 사진·감성 라이프스타일).
 * 집안일 신호가 같이 있으면 통과시킨다 (청소하는 사람은 살려야 한다).
 */
const IDLE_PERSON_WORDS =
  /\b(portrait|model|posing|selfie|social media|scrolling|relaxing|resting|sleeping|fashion|beauty|makeup|cosmetic|yoga|fitness|workout|gym|dancing|party|smoking|drinking)\b/i;

function isOfficeQuery(query: string): boolean {
  return /desk|office|workspace|laptop|computer|study/i.test(query);
}

function isFoodQuery(query: string): boolean {
  return /cooking|food|recipe|baking/i.test(query);
}

function isOutdoorQuery(query: string): boolean {
  return /camping|outdoor|car\b/i.test(query);
}

/** true 면 배경 후보에서 제외 (테스트에서 직접 호출하려고 export 한다) */
export function isUnusableClip(text: string, query: string): boolean {
  if (ANIMAL_WORDS.test(text)) return true;
  if (SYNTHETIC_WORDS.test(text)) return true;
  if (OFFTOPIC_WORDS.test(text)) return true;
  if (!isFoodQuery(query) && FOOD_WORDS.test(text)) return true;
  if (!isOutdoorQuery(query) && SCENERY_WORDS.test(text)) return true;
  // 사무실·인물 컷은 "집안일 신호가 없을 때만" 막는다.
  // 이 예외가 없으면 청소하는 사람·설거지하는 손처럼 정작 필요한 컷까지 날아간다.
  const chore = CHORE_WORDS.test(text);
  if (!chore && !isOfficeQuery(query) && OFFICE_WORDS.test(text)) return true;
  if (!chore && IDLE_PERSON_WORDS.test(text)) return true;
  return false;
}

/**
 * 받아둔 클립 보관 개수 상한.
 *
 * 다운로드한 클립을 지우는 코드가 없어 public/assets/broll 이 계속 불어난다
 * (2026-08-05 기준 로컬 975MB / 69개). 이 디렉터리는 Remotion 번들에 통째로
 * 복사되므로 렌더가 느려지고 디스크도 낭비된다. 오래된 것부터 정리해 상한을 지킨다.
 * (지워져도 다음 렌더에서 필요하면 다시 받으므로 안전하다)
 */
const MAX_CACHED_CLIPS = 18;

/** 오래된 클립부터 지워 MAX_CACHED_CLIPS 개만 남긴다 */
function pruneOldClips(keepFilenames: string[] = []): void {
  try {
    if (!fs.existsSync(BROLL_DIR)) return;
    const keep = new Set(keepFilenames);
    const files = fs
      .readdirSync(BROLL_DIR)
      .filter((f) => f.endsWith(".mp4") && !keep.has(f))
      .map((f) => ({ f, mtime: fs.statSync(path.join(BROLL_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime); // 최신 우선

    for (const { f } of files.slice(Math.max(0, MAX_CACHED_CLIPS - keep.size))) {
      fs.unlinkSync(path.join(BROLL_DIR, f));
    }
  } catch (e) {
    // 정리 실패가 렌더를 막지는 않는다
    console.warn("스톡 클립 정리 실패(무시):", (e as Error).message.slice(0, 120));
  }
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
  seed: number,
  apiKey: string,
  orientation: StockOrientation
): Promise<StockBroll | null> {
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
      tags?: string;
      videos: Record<string, { url: string; width: number; height: number }>;
    }>;
  };
  // 요청 방향의 렌디션이 있는 것만 후보로 둔다.
  // 예전엔 방향이 안 맞아도 받아 왔는데, cover 크롭은 반대 방향을 맞추면
  // 원본의 30% 안팎만 보여 정작 보여줄 피사체가 화면 밖으로 나갔다.
  // 방향이 없으면 그 후보는 건너뛰고 다음 시드·검색어로 간다.
  // 무관 클립 제외: 동물·풍경·AI 생성물 태그 (isUnusableClip 주석 참고)
  const fits = (f: { url: string; width: number; height: number }) =>
    Boolean(f.url) &&
    (orientation === "portrait" ? f.height > f.width : f.width > f.height);
  const candidates = (data.hits ?? []).filter(
    (v) =>
      v.duration >= MIN_DURATION_SEC &&
      v.duration <= MAX_DURATION_SEC &&
      !isUnusableClip(v.tags ?? "", query) &&
      Object.values(v.videos).some(fits)
  );
  if (candidates.length === 0) return null;
  const video = candidates[Math.abs(seed) % candidates.length];
  const targetWidth = orientation === "portrait" ? 1080 : 1280;
  // 목표 폭에 가장 가까운 렌디션
  const pick = Object.values(video.videos)
    .filter(fits)
    .sort(
      (a, b) => Math.abs(a.width - targetWidth) - Math.abs(b.width - targetWidth)
    )[0];
  if (!pick) return null;
  // 가로 파일은 이름을 구분한다 - 같은 id 의 세로 캐시 파일을 재사용하면 안 되므로
  const suffix = orientation === "landscape" ? "-land" : "";
  const filename = await downloadClip(pick.url, `pixabay-${video.id}${suffix}.mp4`);
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
  seed: number,
  apiKey: string,
  orientation: StockOrientation
): Promise<StockBroll | null> {
  // 시드로 페이지를 회전 → 항상 상위 50개만 쓰지 않고 수백 개 풀에서 고름 (반복 방지)
  const page = 1 + (Math.abs(seed) % PAGE_SPREAD);
  const url =
    `${PEXELS_SEARCH}?query=${encodeURIComponent(query)}` +
    `&orientation=${orientation}&size=medium&per_page=${PER_PAGE}&page=${page}`;
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
      !isUnusableClip(v.url ?? "", query) &&
      pickFile(v, orientation)
  );
  if (candidates.length === 0) {
    return null;
  }

  const video = candidates[Math.abs(seed) % candidates.length];
  const file = pickFile(video, orientation)!;
  // 가로 파일은 이름을 구분한다 - 같은 id 의 세로 캐시 파일을 재사용하면 안 되므로
  const suffix = orientation === "landscape" ? "-land" : "";
  const filename = await downloadClip(file.link, `pexels-${video.id}${suffix}.mp4`);
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

/** 키가 설정된 스톡 제공자만 활성화 (Pexels · Pixabay). 키는 env → Supabase 순. */
async function activeProviders(orientation: StockOrientation): Promise<Provider[]> {
  const list: Provider[] = [];
  const [pexels, pixabay] = await Promise.all([
    resolveKey("PEXELS_API_KEY"),
    resolveKey("PIXABAY_API_KEY"),
  ]);
  if (pexels) {
    list.push({
      name: "Pexels",
      fetch: (q, s) => fetchFromPexels(q, s, pexels, orientation),
    });
  }
  if (pixabay) {
    list.push({
      name: "Pixabay",
      fetch: (q, s) => fetchFromPixabay(q, s, pixabay, orientation),
    });
  }
  return list;
}

export async function fetchStockBrolls(
  category: string,
  displayNumber: number,
  count: number,
  productName = "",
  orientation: StockOrientation = "portrait"
): Promise<StockBroll[]> {
  // 검색어 풀: 상품명 특화 검색어(있으면) + 카테고리 변형들. 모두 생활감 보정.
  const pq = productQuery(productName);
  const rawQueries = [...(pq ? [pq] : []), ...categoryQueries(category)];
  const queries = [...new Set(rawQueries.map(domesticize))];

  const providers = await activeProviders(orientation);
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
    // 검색어와 제공자를 같은 attempt 로 돌리면 조합의 절반에 영원히 도달하지 못한다.
    // (검색어 4 × 제공자 2 일 때 8조합 중 4개만 나옴 → 검색어 절반이 죽고 배경이 단조로워짐)
    // 제공자는 검색어를 한 바퀴 돈 뒤에 넘어가게 해 모든 조합을 커버한다.
    const query = queries[attempt % queries.length];
    const provider =
      providers[Math.floor(attempt / queries.length) % providers.length];
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
  // 이번에 쓸 클립은 남기고 오래된 것부터 정리 (번들 크기·디스크 관리)
  pruneOldClips(out.map((c) => c.file));
  return out;
}

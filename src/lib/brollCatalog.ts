/**
 * B-roll 카탈로그 - "이 상품엔 어떤 생활 장면을 붙일까"를 정하는 표.
 *
 * 왜 필요한가: 사용상황형 숏폼(TemplateEUseCase)은 배경이 "상품 사진"이 아니라
 * "그 물건을 쓰는 자리"다. 지금까지는 카테고리 하나로만 스톡을 검색해서
 * 수납템이든 청소템이든 비슷한 장면이 돌았다. 상품명에서 자리를 읽어내면
 * 싱크대 아래 물건엔 싱크대 장면이, 케이블 정리엔 책상 장면이 붙는다.
 *
 * 권리 관계(중요):
 *  · 판매자 상세페이지 영상, 리뷰 영상, 남의 사용 영상은 절대 쓰지 않는다.
 *  · 여기서 쓰는 소재는 두 가지뿐이다.
 *      ① Pexels 스톡 (상업 이용 무료, 출처표기 불필요 - src/lib/broll.ts)
 *      ② 사장님이 직접 넣은 소재 (public/assets/broll/catalog.json 에 등록)
 *  · 어느 쪽이든 "실제 그 제품을 쓰는 장면"이 아니므로 화면에 라벨을 띄운다.
 *    (isActualProductUse=false → "사용 상황 예시")
 */
import fs from "fs";
import path from "path";

/** 장면 종류 - 상품이 놓이는 "자리" */
export const BROLL_SCENE_TAGS = [
  "kitchen",
  "sink",
  "bathroom",
  "storage",
  "fridge",
  "desk",
  "cable",
  "cleaning",
  "laundry",
  "entrance",
  "closet",
  "generic_home",
] as const;
export type BrollSceneTag = (typeof BROLL_SCENE_TAGS)[number];

export interface BrollAsset {
  id: string;
  /** public/assets/broll/ 기준 파일명 */
  file: string;
  tags: BrollSceneTag[];
  /** 이 클립이 담고 있는 장면(사람이 읽는 설명) */
  sceneType: string;
  /** 출처·라이선스 메모 (감사 대비 - 어디서 왔고 왜 써도 되는지) */
  licenseNote: string;
  /**
   * 실제로 "그 제품을 쓰는" 영상인가.
   * 스톡·연출 소재는 false. false 면 화면에 안내 라벨을 띄운다.
   */
  isActualProductUse: boolean;
  /** 화면에 띄울 라벨 (없으면 isActualProductUse 로 자동 결정) */
  overlayLabel?: string;
}

/** 실제 사용 영상이 아닐 때 화면에 띄우는 기본 라벨 */
export const STAGED_SCENE_LABEL = "사용 상황 예시";
/** 연출 촬영분 라벨 */
export const DIRECTED_SCENE_LABEL = "연출 화면";

/** 자산 하나가 화면에 띄워야 할 라벨 (실사용 영상이면 라벨 없음) */
export function overlayLabelFor(asset: Pick<BrollAsset, "isActualProductUse" | "overlayLabel">): string | null {
  if (asset.isActualProductUse) return null;
  return asset.overlayLabel ?? STAGED_SCENE_LABEL;
}

/**
 * 상품명·카테고리 키워드 → 장면 태그.
 *
 * 앞에 있는 규칙이 이긴다(구체적인 자리 → 넓은 자리 순). 하나도 안 걸리면
 * generic_home 으로 떨어져서 렌더가 멈추지 않는다.
 */
const KEYWORD_SCENES: { tag: BrollSceneTag; words: string[] }[] = [
  { tag: "sink", words: ["싱크대", "개수대", "배수구", "설거지", "수전"] },
  { tag: "fridge", words: ["냉장고", "냉동", "밀폐", "보관용기", "김치"] },
  { tag: "cable", words: ["케이블", "선정리", "충전기", "멀티탭", "코드", "전선"] },
  { tag: "desk", words: ["책상", "데스크", "노트북", "모니터", "사무", "필기"] },
  { tag: "bathroom", words: ["욕실", "화장실", "샤워", "변기", "세면", "칫솔", "수건"] },
  { tag: "laundry", words: ["세탁", "빨래", "건조", "다림", "옷걸이", "행거"] },
  { tag: "closet", words: ["옷장", "서랍", "이불", "압축", "의류", "신발장"] },
  { tag: "entrance", words: ["현관", "신발", "우산", "택배", "도어"] },
  { tag: "cleaning", words: ["청소", "먼지", "걸레", "빗자루", "물때", "브러시", "브러쉬", "솔"] },
  { tag: "kitchen", words: ["주방", "조리", "다지기", "칼", "도마", "프라이팬", "냄비", "커피"] },
  { tag: "storage", words: ["수납", "정리", "선반", "걸이", "후크", "훅", "거치", "칸막이", "틈새", "접이식", "흡착", "자석", "보관", "바구니"] },
];

/** 카테고리 이름만으로도 어느 자리인지 대충은 안다 (상품명이 애매할 때의 2순위) */
const CATEGORY_SCENES: Record<string, BrollSceneTag> = {
  주방템: "kitchen",
  청소템: "cleaning",
  수납템: "storage",
  육아생활템: "generic_home",
  차량용품: "generic_home",
  생활템: "generic_home",
  자취템: "generic_home",
};

/**
 * 이 상품에 어울리는 장면 태그들 (앞이 1순위).
 * 항상 최소 하나(generic_home)는 들어 있어 호출부가 빈 배열을 다룰 필요가 없다.
 */
export function sceneTagsFor(productName: string, category?: string | null): BrollSceneTag[] {
  const haystack = `${productName ?? ""} ${category ?? ""}`;
  const tags: BrollSceneTag[] = [];

  for (const rule of KEYWORD_SCENES) {
    if (rule.words.some((w) => haystack.includes(w))) tags.push(rule.tag);
  }

  const byCategory = category ? CATEGORY_SCENES[category] : undefined;
  if (byCategory && !tags.includes(byCategory)) tags.push(byCategory);

  if (!tags.includes("generic_home")) tags.push("generic_home");
  return tags;
}

/**
 * 사장님이 직접 넣은 소재 목록.
 *
 * public/assets/broll/catalog.json 이 있으면 읽고, 없으면 빈 배열이다.
 * 파일이 없거나 형식이 깨져 있어도 절대 throw 하지 않는다 - 카탈로그가 없다고
 * 영상 제작이 멈추면 안 되고, 그때는 기존 스톡 경로가 그대로 돌면 된다.
 */
const CATALOG_PATH = path.resolve("public/assets/broll/catalog.json");

export function loadBrollCatalog(): BrollAsset[] {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
    const list = Array.isArray(raw) ? raw : raw?.assets;
    if (!Array.isArray(list)) return [];

    return list.filter(isUsableAsset);
  } catch (e) {
    console.warn(`B-roll 카탈로그 읽기 실패(무시): ${(e as Error).message.slice(0, 150)}`);
    return [];
  }
}

/** 형식이 맞고 파일이 실제로 있는 항목만 통과 (없는 파일을 렌더에 넘기면 화면이 빈다) */
function isUsableAsset(a: unknown): a is BrollAsset {
  if (!a || typeof a !== "object") return false;
  const asset = a as Partial<BrollAsset>;
  if (typeof asset.file !== "string" || !asset.file) return false;
  if (!Array.isArray(asset.tags)) return false;
  // 경로 탈출 방지 - 파일명만 받는다
  if (asset.file.includes("/") || asset.file.includes("..")) return false;
  return fs.existsSync(path.resolve("public/assets/broll", asset.file));
}

/**
 * 장면 태그에 맞는 소재를 앞선 태그 우선으로 고른다.
 * 카탈로그가 비어 있으면 빈 배열 → 호출부는 기존 스톡 경로로 간다.
 */
export function pickCatalogAssets(
  tags: BrollSceneTag[],
  count: number,
  catalog: BrollAsset[] = loadBrollCatalog()
): BrollAsset[] {
  if (catalog.length === 0 || count <= 0) return [];

  const picked: BrollAsset[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    for (const asset of catalog) {
      if (picked.length >= count) return picked;
      if (seen.has(asset.file)) continue;
      if (!asset.tags.includes(tag)) continue;
      seen.add(asset.file);
      picked.push(asset);
    }
  }
  return picked;
}

/**
 * 스톡 검색에 쓸 영어 질의 (장면 태그 → Pexels 검색어).
 * 기존 카테고리 기반 검색(broll.ts)보다 자리를 좁게 잡아 "그 물건 쓰는 자리"가 나온다.
 */
const SCENE_QUERIES: Record<BrollSceneTag, string> = {
  kitchen: "home kitchen counter cooking",
  sink: "kitchen sink washing dishes",
  bathroom: "clean bathroom interior",
  storage: "home storage shelf organizing",
  fridge: "refrigerator food containers",
  desk: "tidy home desk workspace",
  cable: "desk cable organizer wires",
  cleaning: "cleaning home surface",
  laundry: "laundry room folding clothes",
  entrance: "home entrance hallway shoes",
  closet: "closet organizing clothes",
  generic_home: "cozy home interior daily life",
};

export function sceneQuery(tag: BrollSceneTag): string {
  return SCENE_QUERIES[tag] ?? SCENE_QUERIES.generic_home;
}

/**
 * 렌더에 넘기기 전, 실제로 파일이 있는 것만 남긴다.
 *
 * 이게 왜 필요한가(실측 2026-09-06): Remotion 의 <OffthreadVideo> 는 파일을
 * 못 찾으면 delayRender() 핸들을 연 채로 끝난다. onError 를 달아도 Remotion 은
 * onError 만 부르고 핸들을 닫아주지 않아서(remotion/dist .../OffthreadVideoForRendering.js),
 * 결국 "delayRender 가 28초 동안 안 풀렸다"는 타임아웃으로 렌더가 통째로 실패한다.
 * 즉 템플릿 쪽 onError 만으로는 못 막는다 - 애초에 없는 파일을 넘기지 않는 게 유일한 방어다.
 *
 * 파일이 사라지는 경로는 실제로 있다: 다운로드가 중간에 끊기거나,
 * 카탈로그에 적힌 파일을 사장님이 나중에 지우거나, 조각내기가 실패한 경우.
 */
export function existingBrollFiles(files: string[] | null | undefined): string[] {
  if (!files || files.length === 0) return [];
  return files.filter((file) => {
    if (!file || file.includes("/") || file.includes("..")) return false;
    const full = path.resolve("public/assets/broll", file);
    try {
      return fs.statSync(full).size > 0;
    } catch {
      return false;
    }
  });
}

import { searchProducts, priceText, type CoupangProduct } from "./coupang";
import { geminiGenerateJson } from "./ai";

/**
 * 스튜디오(직접 소재 제작) 모드 - 소재 추천.
 *
 * 흐름:
 *  1) 쿠팡 키워드 검색으로 후보 상품 풀 수집 (제휴링크 포함)
 *  2) Gemini 가 "도우인(중국 틱톡)에서 영상을 찾기 쉬운" 유명 브랜드/흔한 제품을 선별하고
 *     복붙용 중국어 검색 키워드를 만들어준다.
 *  3) 사용자는 키워드를 도우인에 검색 → tikvideo.app 으로 영상 다운로드 → 스튜디오에 업로드.
 */

export interface StudioIdea {
  productName: string;
  category: string;
  price: string;
  imageUrl: string | null;
  /** 쿠팡 제휴 링크 (검색 API 가 이미 제휴링크로 반환) */
  coupangUrl: string;
  /** 도우인 복붙용 중국어 검색 키워드 (1~3개) */
  douyinKeywords: string[];
  /** 왜 도우인에서 찾기 쉬운지 한 줄 설명 */
  reason: string;
}

/**
 * 스튜디오용 검색 키워드 풀.
 * "도우인에 검색하면 정확히 그 제품만 나오는" 브랜드+모델형 제품 위주
 * (갤럭시 S25 울트라처럼 모델명으로 특정되는 것들 - 비슷한 짝퉁/유사품 혼동이 없다).
 * 조건: 중국에서도 똑같이 팔리는 글로벌 브랜드여야 도우인에 영상이 있다.
 */
const STUDIO_SEARCH_KEYWORDS: Array<{ keyword: string; appCategory: string }> = [
  // 스마트폰/디지털 (모델명으로 100% 특정)
  { keyword: "갤럭시 S25 울트라", appCategory: "생활템" },
  { keyword: "갤럭시 Z 플립6", appCategory: "생활템" },
  { keyword: "아이폰 16 프로", appCategory: "생활템" },
  { keyword: "에어팟 프로 2", appCategory: "생활템" },
  { keyword: "갤럭시 버즈3 프로", appCategory: "생활템" },
  { keyword: "애플워치 10", appCategory: "생활템" },
  { keyword: "갤럭시 워치7", appCategory: "생활템" },
  { keyword: "아이패드 에어", appCategory: "생활템" },
  { keyword: "닌텐도 스위치", appCategory: "생활템" },
  { keyword: "인스타360", appCategory: "생활템" },
  { keyword: "고프로 히어로13", appCategory: "생활템" },
  { keyword: "샤오미 미밴드9", appCategory: "생활템" },
  // 브랜드 가전 (브랜드+제품군으로 특정)
  { keyword: "다이슨 에어랩", appCategory: "생활템" },
  { keyword: "다이슨 무선청소기", appCategory: "청소템" },
  { keyword: "로보락 로봇청소기", appCategory: "청소템" },
  { keyword: "드리미 로봇청소기", appCategory: "청소템" },
  { keyword: "샤오미 공기청정기", appCategory: "생활템" },
  { keyword: "샤오미 가습기", appCategory: "생활템" },
  { keyword: "카처 고압세척기", appCategory: "청소템" },
  { keyword: "필립스 전동칫솔", appCategory: "생활템" },
  { keyword: "오랄비 전동칫솔", appCategory: "생활템" },
  { keyword: "브리타 정수기", appCategory: "주방템" },
  { keyword: "휴롬 착즙기", appCategory: "주방템" },
  // 중국에서 유명한 생활 브랜드 (브랜드로 특정)
  { keyword: "스탠리 텀블러", appCategory: "생활템" },
  { keyword: "락앤락 밀폐용기", appCategory: "주방템" },
  { keyword: "타이거 보온병", appCategory: "주방템" },
  { keyword: "조지루시 보온병", appCategory: "주방템" },
];

/** Gemini 실패 시 카테고리별 기본 중국어 키워드 */
const FALLBACK_CN: Record<string, string[]> = {
  청소템: ["清洁神器", "家务清洁好物"],
  주방템: ["厨房神器", "厨房好物"],
  수납템: ["收纳神器", "收纳好物"],
  생활템: ["家居好物", "居家神器"],
  육아생활템: ["母婴好物", "婴儿用品"],
};

interface GeminiPick {
  index: number;
  douyinKeywords: string[];
  reason: string;
}

const PICK_SCHEMA = {
  type: "OBJECT",
  properties: {
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          douyinKeywords: { type: "ARRAY", items: { type: "STRING" } },
          reason: { type: "STRING" },
        },
        required: ["index", "douyinKeywords", "reason"],
        propertyOrdering: ["index", "douyinKeywords", "reason"],
      },
    },
  },
  required: ["picks"],
};

const PICK_SYSTEM = `너는 중국 숏폼 플랫폼 도우인(抖音)을 잘 아는 소싱 전문가다.
한국 쿠팡 상품 목록을 보고, 도우인에서 검색하면 "정확히 그 제품만" 나오는 상품을 고른다.

핵심 기준 (가장 중요):
- 브랜드+모델명으로 100% 특정되는 제품만 고른다 (예: 갤럭시 S25 울트라, 다이슨 에어랩, 로보락 S8).
  검색했을 때 비슷한 유사품/다른 브랜드가 섞여 나오는 일반 생활용품(수납함, 청소솔 등)은 제외.
- 중국에서도 정식으로 팔리는 글로벌 브랜드여야 한다 (도우인에 리뷰/개봉기 영상이 많음).
- 액세서리는 제외: 케이스, 필름, 충전기, 거치대, 호환품, 리퍼 상품이면 고르지 마라.
  본품(기기/제품 자체)만 고른다.

douyinKeywords 규칙:
- 도우인 검색창에 그대로 붙여넣을 간체 중국어 2~3개.
- 반드시 "중국어 브랜드명 + 모델명" 조합 (모델명·숫자는 그대로 유지).
  예) 三星Galaxy S25 Ultra / 戴森吹风机 Airwrap / 石头扫地机器人 / 苹果AirPods Pro 2 /
      小米空气净化器 / 追觅吸尘器 / 斯坦利保温杯 / 任天堂Switch / 飞利浦电动牙刷 /
      乐扣乐扣保鲜盒 / 虎牌保温杯 / 象印保温杯 / 卡赫高压清洗机 / 影石Insta360
- "개봉기/리뷰" 계열 보조 키워드 1개 추가 가능 (예: "S25 Ultra 开箱").
- reason 은 한국어 한 문장 (왜 정확히 그 제품 영상만 나오는지).
- 다양성: 같은 브랜드 제품은 최대 2개까지만 고른다.`;

/** 배열에서 무작위 n개 (중복 없이) */
function sampleArray<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * 소재 추천 목록 생성.
 * 쿠팡 검색 실패 키워드는 건너뛰고, Gemini 실패 시엔 카테고리 기본 중국어 키워드로 폴백.
 */
export async function suggestStudioIdeas(count = 5): Promise<StudioIdea[]> {
  // 1) 후보 풀 수집 (키워드 6개 × 최대 10개 - 케이스/필름 등 액세서리가 섞여
  //    나오므로 넉넉히 모아서 Gemini 가 본품만 걸러낸다)
  const picked = sampleArray(STUDIO_SEARCH_KEYWORDS, 6);
  const pool: Array<{ product: CoupangProduct; appCategory: string }> = [];
  const seen = new Set<number>();
  for (const { keyword, appCategory } of picked) {
    try {
      const items = await searchProducts(keyword, 10);
      for (const p of items) {
        if (seen.has(p.productId)) continue;
        seen.add(p.productId);
        pool.push({ product: p, appCategory });
      }
    } catch (e) {
      console.warn(`스튜디오 검색 실패(${keyword}):`, (e as Error).message);
    }
  }
  if (pool.length === 0) return [];

  // 2) Gemini 선별 + 중국어 키워드
  let picks: GeminiPick[] | null = null;
  try {
    const listText = pool
      .map((c, i) => `${i}. ${c.product.productName}`)
      .join("\n");
    const result = await geminiGenerateJson<{ picks: GeminiPick[] }>({
      system: PICK_SYSTEM,
      prompt: [
        `아래 쿠팡 상품 목록에서 도우인 영상 소재로 좋은 상품 ${count}개를 골라줘.`,
        "",
        listText,
      ].join("\n"),
      schema: PICK_SCHEMA,
      temperature: 0.8,
    });
    picks = result?.picks ?? null;
  } catch (e) {
    console.warn("스튜디오 Gemini 선별 실패 - 기본 키워드로 폴백:", (e as Error).message);
  }

  // 3) 결과 조립 (Gemini 실패 시 풀 앞쪽 + 카테고리 기본 키워드)
  const toIdea = (
    c: { product: CoupangProduct; appCategory: string },
    douyinKeywords: string[],
    reason: string
  ): StudioIdea => ({
    productName: c.product.productName,
    category: c.appCategory,
    price: priceText(c.product.productPrice),
    imageUrl: c.product.productImage || null,
    coupangUrl: c.product.productUrl,
    douyinKeywords,
    reason,
  });

  if (picks && picks.length > 0) {
    return picks
      .filter((p) => Number.isInteger(p.index) && pool[p.index])
      .slice(0, count)
      .map((p) =>
        toIdea(
          pool[p.index],
          p.douyinKeywords.filter(Boolean).slice(0, 3),
          p.reason
        )
      );
  }
  return sampleArray(pool, Math.min(count, pool.length)).map((c) =>
    toIdea(
      c,
      FALLBACK_CN[c.appCategory] ?? FALLBACK_CN["생활템"],
      "중국에서도 흔히 팔리는 생활용품이라 시연 영상이 많은 편이에요."
    )
  );
}

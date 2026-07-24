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
 * 도우인에 영상이 많은 "만국 공통 생활용품" 위주 - 브랜드보다 제품 종류가 중요하다
 * (중국에서도 똑같이 팔리는 물건이어야 시연 영상이 많다).
 */
const STUDIO_SEARCH_KEYWORDS: Array<{ keyword: string; appCategory: string }> = [
  { keyword: "규조토 발매트", appCategory: "생활템" },
  { keyword: "실리콘 주방용품", appCategory: "주방템" },
  { keyword: "다용도 청소솔", appCategory: "청소템" },
  { keyword: "수납 정리함", appCategory: "수납템" },
  { keyword: "미니 다지기", appCategory: "주방템" },
  { keyword: "돌돌이 테이프클리너", appCategory: "청소템" },
  { keyword: "문틈 청소", appCategory: "청소템" },
  { keyword: "주방 기름때", appCategory: "주방템" },
  { keyword: "욕실 물때 제거", appCategory: "청소템" },
  { keyword: "냉장고 정리 용기", appCategory: "수납템" },
  { keyword: "빨래 건조대", appCategory: "생활템" },
  { keyword: "먼지제거기", appCategory: "청소템" },
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
한국 쿠팡 상품 목록을 보고, 도우인에서 검색하면 제품 시연/사용 영상이 충분히 나올 만한
상품을 고른다. 기준:
- 중국에서도 똑같이 팔리는 만국 공통 생활용품(규조토 매트, 실리콘 주방템, 청소솔, 수납함 등)일수록 좋다.
- 한국 전용 브랜드/한국에만 있는 제품은 제외한다.
- douyinKeywords 는 도우인 검색창에 그대로 붙여넣을 간체 중국어 키워드 2~3개.
  제품 종류가 정확히 드러나게 (예: "硅藻泥地垫" 규조토매트, "缝隙清洁刷" 틈새청소솔).
  브랜드가 중국에서 유명하면 브랜드+제품 조합도 1개 포함.
- reason 은 한국어 한 문장 (왜 도우인에서 영상 찾기 쉬운지).`;

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
  // 1) 후보 풀 수집 (키워드 4개 × 최대 10개)
  const picked = sampleArray(STUDIO_SEARCH_KEYWORDS, 4);
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

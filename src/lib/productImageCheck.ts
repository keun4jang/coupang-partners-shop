/**
 * 상품 대표 사진 품질 검사 (비전).
 *
 * 왜 필요한가 (2026-09-13 실측, 247번 영상):
 *   영상 첫 화면 카드에 "바람이 알아서 채워진다고?" 라는 후킹 문구와 함께
 *   들판에 서 있는 사람 사진이 떴고, 그 위에 중국어 "收纳小巧 轻松提起" 가
 *   박혀 있었다. 제품(차박용 접이식 에어)은 사진에 보이지도 않는다.
 *   시청자 입장에서는 "무슨 제품인지 모르겠고 중국 광고 같다" 가 된다.
 *
 * 원인: products.image_url 은 쿠팡파트너스 API 가 주는 대표 썸네일을 그대로
 * 넣은 값이다(scout.ts). 수입 생활용품은 판매자가 중국 공급사 마케팅 이미지를
 * 그대로 올리는 경우가 많아, 우리가 고를 여지 없이 그런 사진이 들어온다.
 *
 * 그래서 사진을 한 장씩 비전으로 보고 두 가지만 묻는다:
 *   1) 사진 위에 외국어 마케팅 문구가 입혀져 있나
 *   2) 상품명이 가리키는 물건이 사진에 분명히 보이나
 * 둘 중 하나라도 아니면 그 상품은 영상 후보에서 뺀다. 재고가 1,000개가 넘어서
 * 까다롭게 걸러도 만들 거리는 남는다 - 반대로 나쁜 사진 한 장은 그 영상
 * 전체를 버리게 만든다.
 *
 * 스톡 영상 프레임의 자막·워터마크를 잡는 videoSource.ts 의 비전 검사와
 * 목적이 다르다: 저쪽은 "덮어서 지울 영역"을 찾고, 여기는 "이 상품을 쓸지"를
 * 판정한다. 그래서 박스 좌표가 아니라 불리언 두 개만 받는다.
 */
import { fetchImageBuffer } from "./mediaFetch";

export interface ProductImageVerdict {
  /** 영상에 써도 되는 사진인가 */
  ok: boolean;
  /** 사람이 읽을 판정 사유 (로그·리포트용) */
  reason: string;
  /** 사진 위에 입힌 외국어 마케팅 문구가 있나 */
  foreignTextOverlay: boolean;
  /** 상품명이 가리키는 물건이 사진에 분명히 보이나 */
  showsProduct: boolean;
  /** 사진의 주요 피사체 (디버깅용: "사람", "제품 단독" 등) */
  mainSubject: string;
}

interface VisionAnswer {
  foreignTextOverlay: boolean;
  foreignTextSample: string;
  showsProduct: boolean;
  mainSubject: string;
  confidence: number;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    foreignTextOverlay: { type: "BOOLEAN" },
    foreignTextSample: { type: "STRING" },
    showsProduct: { type: "BOOLEAN" },
    mainSubject: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["foreignTextOverlay", "showsProduct", "mainSubject", "confidence"],
  propertyOrdering: [
    "foreignTextOverlay",
    "foreignTextSample",
    "showsProduct",
    "mainSubject",
    "confidence",
  ],
};

function buildPrompt(productName: string): string {
  return `이 이미지는 한국 쇼핑몰에 올라온 상품 "${productName}" 의 대표 사진이다.
한국인 시청자에게 보여줄 숏폼 영상의 첫 화면에 쓸 수 있는 사진인지 판정하라.

foreignTextOverlay — 사진 위에 "입혀진" 외국어 마케팅 문구가 있으면 true:
- 중국어·일본어 홍보 문구(예: "收纳小巧 轻松提起"), 외국어 자막 스타일 글씨
- 사진 편집으로 덧붙인 외국어 설명/가격/혜택 문구
다음은 false 로 둔다(정상적인 상품 사진의 일부다):
- 제품 몸체·포장에 원래 인쇄된 브랜드명이나 로고 (예: 제품에 박힌 "SONY")
- 한국어 문구
foreignTextSample 에는 발견한 문구를 그대로 짧게 적는다(없으면 빈 문자열).

showsProduct — 상품명 "${productName}" 이 가리키는 그 물건이 사진에서 무엇인지
알아볼 수 있으면 true. 다음이면 false:
- 사람·풍경·분위기만 크게 나오고 정작 그 제품은 안 보이거나 알아볼 수 없다
- 전혀 다른 물건이 주인공이다
- 제품이 너무 작거나 가려져서 무엇인지 분간이 안 된다

mainSubject — 사진의 주요 피사체를 한국어 한 단어~짧은 구로 (예: "제품 단독", "사람", "풍경", "여러 제품 콜라주").
confidence — 위 판정에 대한 확신도 0.0~1.0.`;
}

/** 이 확신도 미만이면 판정을 믿지 않고 통과시킨다 (멀쩡한 상품을 잘못 버리지 않게) */
const MIN_CONFIDENCE = 0.6;

/**
 * 대표 사진 한 장 판정.
 *
 * 반환값이 null 이면 "검사하지 못했다"(키 없음·네트워크 실패·API 오류)는 뜻이고,
 * 호출부는 통과로 처리해야 한다. 검사 장치가 죽었다고 상품 수집 자체가 멈추면
 * 재고가 마르는 쪽이 더 큰 손해다 - 이건 품질 게이트지 안전 장치가 아니다.
 */
export async function checkProductImage(input: {
  imageUrl: string | null | undefined;
  productName: string;
}): Promise<ProductImageVerdict | null> {
  const { imageUrl, productName } = input;
  if (!imageUrl) {
    return {
      ok: false,
      reason: "대표 사진이 없음",
      foreignTextOverlay: false,
      showsProduct: false,
      mainSubject: "",
    };
  }

  const img = await fetchImageBuffer(imageUrl);
  if (!img) return null;

  const { geminiGenerateJson } = await import("./ai");
  let answer: VisionAnswer | null = null;
  try {
    answer = await geminiGenerateJson<VisionAnswer>({
      prompt: buildPrompt(productName),
      schema: SCHEMA,
      temperature: 0.1,
      model: process.env.GEMINI_VISION_MODEL ?? "gemini-flash-lite-latest",
      image: { base64: img.buffer.toString("base64"), mimeType: img.mimeType },
    });
  } catch (e) {
    console.warn(`사진 검사 실패(통과 처리): ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
  if (!answer) return null;

  // 확신이 없으면 판정을 접는다. 애매한 사진 하나를 살리는 쪽이,
  // 멀쩡한 상품을 근거 없이 버리는 쪽보다 낫다.
  if (typeof answer.confidence === "number" && answer.confidence < MIN_CONFIDENCE) {
    return null;
  }

  const reasons: string[] = [];
  if (answer.foreignTextOverlay) {
    const sample = (answer.foreignTextSample ?? "").trim().slice(0, 40);
    reasons.push(sample ? `외국어 문구 박힘("${sample}")` : "외국어 문구 박힘");
  }
  if (!answer.showsProduct) {
    const subject = (answer.mainSubject ?? "").trim();
    reasons.push(subject ? `제품이 안 보임(주요 피사체: ${subject})` : "제품이 안 보임");
  }

  return {
    ok: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join(" · ") : "정상",
    foreignTextOverlay: Boolean(answer.foreignTextOverlay),
    showsProduct: Boolean(answer.showsProduct),
    mainSubject: (answer.mainSubject ?? "").trim(),
  };
}

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
 *   1) 중국어·일본어가 사진에 박혀 있나
 *   2) 상품명이 가리키는 물건이 사진에 분명히 보이나
 *
 * 둘 중 하나라도 아니면 그 상품은 영상 후보에서 뺀다. 재고가 1,000개가 넘어서
 * 까다롭게 걸러도 만들 거리는 남는다 - 반대로 나쁜 사진 한 장은 그 영상
 * 전체를 버리게 만든다.
 *
 * 1번을 "외국어"가 아니라 "중국어·일본어"로 좁힌 이유: 2026-09-14 첫 진단에서
 * "외국어"로 물었더니 영어 브랜드명·포장지 문구·한국어까지 싸잡아 걸러
 * 100개 중 11건이 전부 가짜 양성이었다. 한국 쇼핑몰 상품 사진에 영어가
 * 들어간 건 정상이다. 사장님이 싫다고 한 것도 콕 집어 중국어였다.
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
  /** 중국어·일본어가 사진에 박혀 있나 (근거 문구까지 확인된 것만 true) */
  cjkTextOverlay: boolean;
  /** 상품명이 가리키는 물건이 사진에 분명히 보이나 */
  showsProduct: boolean;
  /** 사진의 주요 피사체 (디버깅용: "사람", "제품 단독" 등) */
  mainSubject: string;
}

interface VisionAnswer {
  cjkTextOverlay: boolean;
  cjkTextSample: string;
  showsProduct: boolean;
  mainSubject: string;
  confidence: number;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    cjkTextOverlay: { type: "BOOLEAN" },
    cjkTextSample: { type: "STRING" },
    showsProduct: { type: "BOOLEAN" },
    mainSubject: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["cjkTextOverlay", "showsProduct", "mainSubject", "confidence"],
  propertyOrdering: [
    "cjkTextOverlay",
    "cjkTextSample",
    "showsProduct",
    "mainSubject",
    "confidence",
  ],
};

function buildPrompt(productName: string): string {
  return `이 이미지는 한국 쇼핑몰에 올라온 상품 "${productName}" 의 대표 사진이다.
한국인 시청자에게 보여줄 숏폼 영상의 첫 화면에 쓸 수 있는 사진인지 판정하라.

【판정 1】 cjkTextOverlay — 중국어(간체·번체) 또는 일본어(히라가나·가타카나)
글자가 사진에 보이면 true. 그 외에는 무조건 false.

  true 로 둘 것:
  - 中文 홍보 문구 (예: "收纳小巧 轻松提起", "厂家直销")
  - 일본어 자막·문구 (예: "かんたん収納")
  - 위치는 상관없다. 사진 위에 얹힌 자막이든 포장지에 인쇄된 것이든 true.

  반드시 false 로 둘 것 (여기서 헷갈리면 안 된다):
  - 한국어는 무슨 내용이든, 어디에 있든 false. ("화이트 블랙 핑크", "눈에 띄는" 등)
  - 영어는 무슨 내용이든 false. 브랜드명("GREATWALL", "SONY"), 제품명("EGG PANG"),
    스펙 표기("3.7V Li-ion Cordless Driver"), 포장지 문구("KITCHEN TOWEL"),
    원산지 표기("MADE IN KOREA") — 전부 false.
  - 한자가 섞여 있어도 한국식 한자(한국어 문맥)면 false.
  한국 쇼핑몰 상품 사진에 영어가 들어간 건 지극히 정상이다. 오직 중국어·일본어만 잡는다.

cjkTextSample 에는 발견한 중국어/일본어를 그대로 짧게 적는다(없으면 빈 문자열).

【판정 2】 showsProduct — 상품명 "${productName}" 이 가리키는 그 물건이
사진의 주인공으로 또렷이 보이면 true.

  false 로 둘 것:
  - 사람(모델)이 화면 대부분을 차지하고 제품은 안 보이거나 손톱만 하다
  - 풍경·실내 분위기만 있고 제품을 못 찾겠다
  - 상품명과 전혀 다른 물건이 주인공이다
  - 제품이 가려지거나 흐려서 무엇인지 분간이 안 된다

  true 로 둘 것:
  - 제품 단독 사진 (배경 무관)
  - 사람이 제품을 쓰고 있지만 제품이 또렷이 보인다
  - 여러 각도·구성품을 모아둔 콜라주라도 제품이 무엇인지 알 수 있다

mainSubject — 사진의 주요 피사체를 한국어 짧은 구로 (예: "제품 단독", "모델이 입은 옷", "들판 풍경").
confidence — 위 판정에 대한 확신도 0.0~1.0.`;
}

/** 이 확신도 미만이면 판정을 믿지 않고 통과시킨다 (멀쩡한 상품을 잘못 버리지 않게) */
const MIN_CONFIDENCE = 0.6;

const CJK_RE = /[一-鿿぀-ゟ゠-ヿ]/;
const HANGUL_RE = /[가-힯]/;

/**
 * 모델이 "중국어가 있다"고 한 주장을 코드로 검증한다.
 *
 * 2026-09-14 첫 진단에서 flash-lite 는 영어 브랜드명("GREATWALL"), 포장지 문구
 * ("KITCHEN TOWEL"), 심지어 한국어("화이트 블랙 핑크")까지 외국어로 신고했다.
 * 100개 중 11건이 걸렸는데 전부 가짜 양성이었다. 프롬프트를 아무리 조여도
 * 이런 실수는 또 난다 - 그래서 모델이 근거로 내민 문구에 한자·가나가 실제로
 * 들어 있는지 여기서 다시 본다. 근거를 못 대면 그 주장은 버린다.
 */
export function looksCjk(sample: string): boolean {
  const s = sample.trim();
  // 근거(샘플)를 못 대면 믿지 않는다
  if (!s) return false;
  if (!CJK_RE.test(s)) return false;
  // 한글이 섞여 있으면 한자가 낀 한국어 문장이다 (예: "特價 세일")
  if (HANGUL_RE.test(s)) return false;
  return true;
}

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
      cjkTextOverlay: false,
      showsProduct: false,
      mainSubject: "",
    };
  }

  const img = await fetchImageBuffer(imageUrl);
  if (!img) return null;

  const { geminiGenerateJson } = await import("./ai");
  const call = () =>
    geminiGenerateJson<VisionAnswer>({
      prompt: buildPrompt(productName),
      schema: SCHEMA,
      temperature: 0.1,
      model: process.env.GEMINI_VISION_MODEL ?? "gemini-flash-lite-latest",
      image: { base64: img.buffer.toString("base64"), mimeType: img.mimeType },
    });

  let answer: VisionAnswer | null = null;
  try {
    answer = await call();
  } catch (e) {
    const msg = (e as Error).message;
    // 무료 등급 분당 한도. 첫 진단에서 100건 중 6건이 여기서 날아갔다
    // (videoSource.detectBoxesGemini 도 같은 이유로 같은 재시도를 한다).
    if (msg.includes("429")) {
      await new Promise((r) => setTimeout(r, 15_000));
      try {
        answer = await call();
      } catch {
        console.warn("사진 검사 실패(통과 처리): 한도 초과 재시도도 실패");
        return null;
      }
    } else {
      console.warn(`사진 검사 실패(통과 처리): ${msg.slice(0, 120)}`);
      return null;
    }
  }
  if (!answer) return null;

  // 확신이 없으면 판정을 접는다. 애매한 사진 하나를 살리는 쪽이,
  // 멀쩡한 상품을 근거 없이 버리는 쪽보다 낫다.
  if (typeof answer.confidence === "number" && answer.confidence < MIN_CONFIDENCE) {
    return null;
  }

  const sample = (answer.cjkTextSample ?? "").trim();
  // 모델 주장 그대로 믿지 않고, 근거 문구에 한자·가나가 실제로 있는지 확인한다.
  const cjkConfirmed = Boolean(answer.cjkTextOverlay) && looksCjk(sample);
  if (answer.cjkTextOverlay && !cjkConfirmed) {
    console.log(
      `사진 검사: 중국어 신고를 근거 부족으로 무시 (근거: "${sample.slice(0, 30)}")`
    );
  }

  const reasons: string[] = [];
  if (cjkConfirmed) {
    reasons.push(`중국어·일본어 박힘("${sample.slice(0, 40)}")`);
  }
  if (!answer.showsProduct) {
    const subject = (answer.mainSubject ?? "").trim();
    reasons.push(subject ? `제품이 안 보임(주요 피사체: ${subject})` : "제품이 안 보임");
  }

  return {
    ok: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join(" · ") : "정상",
    cjkTextOverlay: cjkConfirmed,
    showsProduct: Boolean(answer.showsProduct),
    mainSubject: (answer.mainSubject ?? "").trim(),
  };
}

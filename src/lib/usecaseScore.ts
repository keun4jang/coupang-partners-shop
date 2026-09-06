/**
 * 사용상황형 적합도 점수.
 *
 * "이 상품을 사용상황형(TemplateEUseCase)으로 만드는 게 말이 되는가"만 본다.
 * 판단 근거는 이미 가지고 있는 상품 데이터(이름·카테고리·가격)뿐이다 -
 * 쿠팡 API 를 새로 부르지 않는다(호출 한도·비용 0원 원칙).
 *
 * display_number 에는 손대지 않는다. 이 점수는 오직 "어느 템플릿으로 찍을까"에만 쓴다.
 *
 * 왜 전부 사용상황형으로 안 바꾸나: 지금 클릭률이 낮은 건 사실이지만,
 * 새 포맷이 더 낫다는 증거는 아직 없다. 일부만 바꿔 나란히 돌려야
 * (template_variant + /go 추적) 어느 쪽이 실제로 링크까지 데려가는지 알 수 있다.
 */
import type { Product, ShortsTemplateVariant } from "@/types/db";

/**
 * 사용상황형이 잘 먹히는 상품 - "어디에 두고 어떻게 쓰는지"가 핵심인 물건.
 * 설치 방식·자리 크기가 구매 판단을 가르므로 용도/구조/확인할 점이 실질 정보가 된다.
 */
const POSITIVE_KEYWORDS = [
  "수납",
  "정리",
  "선반",
  "걸이",
  "접이식",
  "흡착",
  "자석",
  "틈새",
  "케이블",
  "청소",
  "욕실",
  "주방",
  "싱크대",
  "냉장고",
  "현관",
  "세탁",
  "행거",
  "후크",
  "훅",
  "칸막이",
  "보관",
  "거치대",
];

/**
 * 사용상황형이 어울리지 않는 상품.
 *
 * · 건강·미용 효능: 우리가 효능을 주장할 수 없다(표시광고법). "확인할 점"을
 *   쓰려면 효능 얘기를 해야 하는데 그건 못 쓴다.
 * · 고가 전자제품: 스펙 비교가 구매 판단이라 "자리" 이야기로는 부족하다.
 * · 소모품: 사진만으로 차이가 없어 상황 영상이 정보를 더해주지 못한다.
 */
const NEGATIVE_KEYWORDS = [
  // 건강·미용 효능 주장이 필요한 상품
  "영양제",
  "비타민",
  "유산균",
  "콜라겐",
  "다이어트",
  "체지방",
  "혈당",
  "관절",
  "면역",
  "화장품",
  "세럼",
  "앰플",
  "에센스",
  "미백",
  "주름",
  "탈모",
  "마스크팩",
  // 스펙 비교가 판단을 가르는 고가 전자
  "노트북",
  "태블릿",
  "스마트폰",
  "티비",
  "TV",
  "모니터",
  "냉장고 ",
  "에어컨",
  "세탁기",
  "건조기",
  "카메라",
  // 사진만으로 차별점이 거의 없는 단순 소모품
  "물티슈",
  "휴지",
  "키친타월",
  "지퍼백",
  "위생장갑",
  "종량제",
  "건전지",
  "면봉",
];

/** 이 금액을 넘으면 고가로 본다 (스펙 비교형이라 사용상황형과 안 맞는다) */
const HIGH_PRICE_KRW = 150_000;

function priceOf(priceText: string | null | undefined): number | null {
  const digits = (priceText ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 0~100 점. 높을수록 사용상황형에 어울린다.
 * 같은 상품이면 항상 같은 점수가 나온다(랜덤 없음 - 재현 가능해야 비교가 된다).
 */
export function usecasePotentialScore(product: Product): number {
  const haystack = `${product.product_name ?? ""} ${product.category ?? ""}`;

  let score = 40; // 중립 출발점

  // 자리·설치가 중요한 물건일수록 가점 (많이 걸릴수록 확실하다)
  const hits = POSITIVE_KEYWORDS.filter((w) => haystack.includes(w)).length;
  score += Math.min(45, hits * 15);

  // 맞지 않는 영역은 확실하게 감점 - 하나만 걸려도 기준 아래로 떨어뜨린다
  if (NEGATIVE_KEYWORDS.some((w) => haystack.includes(w))) score -= 40;

  const price = priceOf(product.price_text);
  if (price !== null && price >= HIGH_PRICE_KRW) score -= 20;

  // 이름이 너무 짧으면(정보가 없으면) 용도·구조를 채울 근거가 부족하다
  if ((product.product_name ?? "").trim().length < 8) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/** 이 점수 이상이어야 사용상황형 후보가 된다 */
export const USECASE_SCORE_THRESHOLD = 70;

/**
 * 이 영상을 어떤 변형으로 만들지 결정한다.
 *
 * 기준 점수를 넘긴 상품 중 절반만 사용상황형으로 보낸다. 전부 보내면
 * "사용상황형에 어울리는 상품"과 "classic 으로 찍힌 상품"이 서로 다른 집단이
 * 돼서, 성과 차이가 템플릿 덕인지 상품 덕인지 구분할 수 없다.
 * 같은 성격의 상품을 반씩 갈라야 비교가 성립한다.
 *
 * 짝수/홀수(displayNumber)로 가르는 이유: 랜덤이 아니라 재현 가능해야
 * 나중에 "이 번호는 왜 이 변형이었나"를 되짚을 수 있다.
 */
export function pickShortsVariant(
  product: Product,
  displayNumber: number
): ShortsTemplateVariant {
  if (usecasePotentialScore(product) < USECASE_SCORE_THRESHOLD) return "classic";
  return displayNumber % 2 === 0 ? "usecase" : "classic";
}

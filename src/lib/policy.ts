/**
 * 발행 전 문구 검증 규칙 한 곳.
 *
 * 예전에는 ai.ts 안에만 있어서 "대본 생성 경로"만 검사했다. 그런데 실제로
 * 밖으로 나가는 텍스트는 대본 말고도 유튜브 제목·설명, 인스타 캡션, 롱폼
 * 설명란이 있고, 이들은 생성 이후에 조립된다. 규칙을 여기로 모아 어느
 * 경로로 만들어진 텍스트든 같은 잣대로 볼 수 있게 했다.
 *
 * 검사는 부분 문자열 매칭이다. "달려 있어요"·"담아두면" 같은 정상 표현이
 * 걸리지 않도록 금지어는 명령형 등 좁은 형태로 적는다.
 */

/**
 * 대가성 고지 문구.
 *
 * 공정위 「추천·보증 등에 관한 표시·광고 심사지침」은 표시문구가 "게시물의
 * 제목 또는 동영상 내"에 있어야 하고 "'더보기'를 눌러야만 확인 가능한 경우"는
 * 부적절하다고 본다. 그래서 영상 화면(TemplateE DisclosureTag)·캡션 첫 줄·
 * 설명란 첫 줄·랜딩 상단 네 곳에 모두 둔다.
 */
export const DISCLOSURE_LINE =
  "이 게시물은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/**
 * 쿠팡파트너스 운영정책 위반 표현 (2026-08 공지 대응).
 * 클릭 유도·긴급성·희소성·과장·오인성 표현은 계정 제재 사유라 코드로 막는다.
 * 걸리면 안전한 프리셋 문구로 폴백한다(내보내지 않는다).
 */
// 부분 문자열로 검사하므로 "달려 있어요"·"담아두면" 같은 정상 표현이
// 걸리지 않도록 명령형 형태까지 포함해 좁게 적는다.
export const POLICY_BANNED_PHRASES = [
  // 클릭 명령·유도
  "클릭",
  "눌러보세요",
  "누르세요",
  "장바구니 담",
  "지금 달려",
  "달려가",
  // 긴급성·희소성
  "서둘러",
  "품절되기 전",
  "마지막 기회",
  "놓치지 마",
  "지나가면 못",
  "다시 찾기 어려",
  "한정수량",
  "수량 한정",
  "마감 임박",
  "오늘만",
  // 과장·오인성
  "미쳤",
  "실화",
  "가격 오류",
  "역대급",
  "최저가",
  "핫딜",
  "특가",
  "반값",
  "떨이",
  "쿠팡 사고",
  "무조건",
  // 긴급성·희소성 (2026-09 클릭률 개선 점검에서 추가)
  "품절 전",
  "얼마 안 남",
  "재입고 어려",
  "한정 수량",
  "한정판매",
  // "지금 사용"·"바로 사용" 같은 정상 표현이 걸리지 않게 종결형까지 붙여 좁게 적는다
  "지금 사세요",
  "지금 사면",
  "지금 구매",
  "바로 사세요",
  "바로 사러",
  "바로 구매",
  "사러 가세요",
  "구매하세요",
  // 과장·단정
  "난리난",
  "난리 난",
  "대박",
  "안 사면",
  "확정가",
  // 근거 없는 사회적 증거 (우리는 후기·평점·판매량 데이터를 가지고 있지 않다)
  "후기 수백",
  "후기가 수백",
  "리뷰 수백",
  "다들 만족",
  "검증된 인기",
  "재구매 후기",
  "후기가 많",
  "후기도 많",
  "평이 좋",
  "평이 괜찮",
  "입소문",
  "스테디셀러",
  "판매 1위",
  "판매량 1위",
];

/** 허위 후기/과장으로 보일 수 있어 금지하는 표현 */
export const BANNED_PHRASES = [
  "직접 써봤",
  "제가 써봤",
  "써보니",
  "우리 아이가 써",
  "매일 쓰고 있",
  "효과 확실",
  "무조건 사세요",
  "무조건 사야",
  "인생템",
  "대박템",
  "안 사면 손해",
  "완전 강추",
  "강추",
];

/**
 * 숫자가 섞여 낱말 목록으로는 못 잡는 위반 표현.
 *
 * "80％OFF", "50% 할인" 같은 할인율 표기가 대표적이다. 쿠팡파트너스는 확인되지
 * 않은 할인율 표기를 금지하는데, 우리는 그 할인이 지금도 유효한지 알 방법이 없고
 * 영상은 영구히 남는다(가격도 수집 시점 스냅샷이라 같은 이유로 시점을 밝힌다).
 *
 * "99% 순면", "100% 국산"처럼 성분·함량 표기는 잡히면 안 되므로,
 * 숫자+% 뒤에 할인 맥락(OFF·할인·세일)이 붙은 경우만 좁게 본다.
 */
const REGEX_BANNED: { label: string; re: RegExp }[] = [
  { label: "할인율 표기", re: /\d+\s*[%％]\s*(off|할인|세일|다운|↓)/gi },
  { label: "할인율 표기", re: /(할인|세일)\s*\d+\s*[%％]/gi },
];

/**
 * 텍스트 한 덩어리에서 정책 위반 표현을 찾는다.
 * 대가성 고지 문구 자체는 검사 대상에서 뺀다(고지에 들어가는 표현이
 * 금지어와 겹치면 자기 고지에 자기가 걸린다).
 */
export function findPolicyIssues(text: string): string[] {
  const body = (text ?? "").split(DISCLOSURE_LINE).join(" ");
  const hits = [
    ...POLICY_BANNED_PHRASES.filter((p) => body.includes(p)),
    ...BANNED_PHRASES.filter((p) => body.includes(p)),
  ];
  for (const { label, re } of REGEX_BANNED) {
    // 전역 정규식은 lastIndex 가 남으므로 매번 초기화한다(안 하면 호출마다 결과가 달라진다)
    re.lastIndex = 0;
    if (re.test(body) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

/** 발행 직전 검사 대상 (없는 항목은 건너뛴다) */
export interface PublishTexts {
  title?: string | null;
  script?: string | null;
  caption?: string | null;
  description?: string | null;
}

export interface PublishIssue {
  field: keyof PublishTexts;
  phrases: string[];
}

/**
 * 발행 직전 전체 검사.
 * 제목·대본·캡션·설명란을 한 번에 본다. 걸린 게 없으면 빈 배열.
 */
export function checkPublishTexts(texts: PublishTexts): PublishIssue[] {
  const fields: (keyof PublishTexts)[] = ["title", "script", "caption", "description"];
  const issues: PublishIssue[] = [];
  for (const field of fields) {
    const value = texts[field];
    if (!value) continue;
    const phrases = findPolicyIssues(value);
    if (phrases.length > 0) issues.push({ field, phrases });
  }
  return issues;
}

/**
 * 판매자가 붙인 상품명에서 금칙 표현만 걷어낸다.
 *
 * 왜 차단이 아니라 정화인가: 쿠팡파트너스가 제재하는 건 "파트너가 쓴 홍보 문구"이지
 * 판매자 원 상품명이 아니다. 그런데 우리 제목·설명·캡션은 상품명을 그대로 품기
 * 때문에, 검사만 걸어두면 "쿠팡특가 스텐 3단 선반" 같은 이름 하나 때문에 렌더까지
 * 끝낸 영상이 발행 직전에 통째로 막힌다. 우리가 고칠 수 있는 문구도 아니라
 * (스카우트가 쿠팡에서 받아온 값이다) 알림을 봐도 손쓸 데가 없다.
 *
 * 그래서 나가는 텍스트에서 그 표현만 지운다. 금칙어가 채널에 안 나가는 결과는
 * 같으면서, 멀쩡한 영상이 사라지지 않는다.
 * 실제 사례: "쿠팡특가", "[한정수량]", "무조건 잘 붙는", "오늘만 이 가격", "대박템"
 */
export function stripBannedFromProductName(name: string): string {
  let out = name ?? "";

  // 긴 표현부터 지운다. "대박"을 먼저 지우면 "대박템"이 "템"이라는 부스러기로 남는다.
  const phrases = [...POLICY_BANNED_PHRASES, ...BANNED_PHRASES].sort(
    (a, b) => b.length - a.length
  );
  for (const phrase of phrases) {
    if (out.includes(phrase)) out = out.split(phrase).join(" ");
  }

  // 숫자가 섞인 표현(할인율 등)은 낱말 목록으로 못 잡으므로 정규식으로 지운다
  for (const { re } of REGEX_BANNED) {
    re.lastIndex = 0;
    out = out.replace(re, " ");
  }

  // 지우고 남은 구두점·공백 정리 ("[  ] 극세사" → "극세사")
  out = out
    .replace(/\[\s*\]|\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 앞머리에 홀로 남은 지시어·조각 제거 ("오늘만 이 가격 세제" → "가격 세제" 대신
  // "이"까지 떼어 "가격 세제"). 뒤쪽은 핵심 명사라 건드리지 않는다.
  const LEADING_FRAGMENT = /^(이|그|저|및|등|또는|외)\s+/;
  while (LEADING_FRAGMENT.test(out)) out = out.replace(LEADING_FRAGMENT, "");

  return out.trim();
}

/** 사람이 읽을 수 있는 한 줄 요약 (텔레그램 알림·로그용) */
export function describePublishIssues(issues: PublishIssue[]): string {
  return issues
    .map((i) => `${i.field}: ${i.phrases.join(", ")}`)
    .join(" / ");
}

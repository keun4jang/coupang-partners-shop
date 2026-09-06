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
 * 텍스트 한 덩어리에서 정책 위반 표현을 찾는다.
 * 대가성 고지 문구 자체는 검사 대상에서 뺀다(고지에 들어가는 표현이
 * 금지어와 겹치면 자기 고지에 자기가 걸린다).
 */
export function findPolicyIssues(text: string): string[] {
  const body = (text ?? "").split(DISCLOSURE_LINE).join(" ");
  return [
    ...POLICY_BANNED_PHRASES.filter((p) => body.includes(p)),
    ...BANNED_PHRASES.filter((p) => body.includes(p)),
  ];
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

/** 사람이 읽을 수 있는 한 줄 요약 (텔레그램 알림·로그용) */
export function describePublishIssues(issues: PublishIssue[]): string {
  return issues
    .map((i) => `${i.field}: ${i.phrases.join(", ")}`)
    .join(" / ");
}

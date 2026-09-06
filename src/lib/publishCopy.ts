/**
 * 발행 직전에 붙이는 설명란·캡션 문구.
 *
 * AI가 만든 본문(caption_text)과 별개로, 채널에 올라가는 최종 텍스트는 항상
 * 여기를 거친다. 이유:
 *  · 대가성 고지가 "맨 위"에 있어야 한다. AI 결과에 맡기면 위치가 흔들린다.
 *  · 이미 큐에 들어간(문구가 만들어진) 영상에도 같은 규칙이 적용돼야 한다.
 *    발행 시점에 붙이므로 예전 항목도 자동으로 고쳐진다.
 *
 * 공정위 「추천·보증 등에 관한 표시·광고 심사지침」은 표시문구가 "'더보기'를
 * 눌러야만 확인 가능한 경우" 부적절하다고 본다. 캡션·설명 첫 줄에 두는 이유다.
 */
import { DISCLOSURE_LINE } from "./ai";
import { landingUrl, type TemplateVariant } from "./tracking";

/** 숏폼 캡션·설명의 템플릿 변형 (성과 비교용 - 링크에 tpl= 로 실린다) */
type ShortsVariant = Extract<TemplateVariant, "classic" | "usecase">;

/**
 * 유튜브 쇼츠 설명.
 *
 * 쇼츠는 2023.8 부터 모바일에서 설명·댓글의 외부 링크가 눌리지 않는다.
 * 그래도 주소를 적어 두는 이유: 데스크톱에서는 눌리고, 안 눌리는 환경에서도
 * "어디에 정리돼 있는지"를 알리는 정보로서 값을 한다. 클릭을 재촉하지 않는다.
 */
export function youtubeShortsDescription(
  displayNumber: number,
  shortProductName: string,
  variant: ShortsVariant = "classic"
): string {
  const url = landingUrl(displayNumber, {
    source: "youtube_shorts",
    channel: "youtube",
    templateVariant: variant,
  });

  return [
    DISCLOSURE_LINE,
    "",
    shortProductName,
    "",
    `제품명·가격·상세 정보는 살림템 메모장 ${displayNumber}번에 정리했습니다.`,
    url,
    "",
    "채널 프로필에도 같은 주소를 걸어두었습니다.",
    "",
    "#Shorts #살림템 #생활템 #쿠팡추천템",
  ].join("\n");
}

/**
 * 인스타그램 릴스 캡션.
 *
 * 인스타는 캡션 앞부분만 접히지 않고 보이므로 고지를 첫 줄에 둔다.
 * 본문(AI 생성분)에 고지가 이미 들어 있으면 중복해서 붙이지 않는다.
 */
export function instagramCaption(
  baseCaption: string,
  displayNumber: number
): string {
  const body = (baseCaption ?? "").trim();
  if (body.includes(DISCLOSURE_LINE)) return body;

  // 본문이 통째로 비어 있는 경우(문구 생성 실패)에도 최소한의 안내는 나가야 한다.
  const fallback = `영상 속 제품은 프로필 링크에 정리해 뒀어요. (${displayNumber}번)`;
  return [DISCLOSURE_LINE, "", body || fallback].join("\n");
}

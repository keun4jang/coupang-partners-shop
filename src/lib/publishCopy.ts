/**
 * 발행 직전에 붙이는 설명란·캡션 문구.
 *
 * AI가 만든 본문(caption_text)과 별개로, 채널에 올라가는 최종 텍스트는 항상
 * 여기를 거친다. 이유:
 *  · 대가성 고지가 빠짐없이 한 번 들어가야 한다. AI 결과에 맡기면 흔들린다.
 *  · 이미 큐에 들어간(문구가 만들어진) 영상에도 같은 규칙이 적용돼야 한다.
 *    발행 시점에 붙이므로 예전 항목도 자동으로 고쳐진다.
 *
 * 2026-10-07 사장님 결정: "[광고]" 표기를 전부 뺀다("보는 사람이 무시하고 넘어간다").
 * 첫 줄은 다시 본문 첫 문장이고, 쿠팡파트너스 고지 전문은 본문 바로 뒤에 정확히 한 번
 * (9/29 구조). 영상 하단 화면 고지는 "[광고]" 없이 고지 문장만 영상 내내 유지한다.
 *
 * (이전 기록) 2026-10-03 수정(전략 재점검, 사장님 승인): 첫 줄 맨 앞에 짧은 "[광고]"를 다시 붙인다.
 * 9/29 처럼 고지를 본문 뒤로만 두면 접힌 캡션('더보기' 앞)에 광고 표시가 없어 공정위
 * 지침("더보기를 눌러야 확인 가능한 경우 부적절")에 걸릴 수 있다. 긴 문장을 첫 줄에
 * 두면 광고 느낌이 너무 강하다는 사장님 의견은 그대로 살려, 첫 줄은 "[광고] + 본문
 * 첫 문장"으로 하고 고지 전문은 본문 바로 뒤에 둔다.
 *
 * (이전 기록) 고지 위치 (2026-09-29 사장님 결정): 예전엔 캡션·설명 첫 줄이었는데, 접힌 상태에서
 * 보이는 유일한 줄이 "이 게시물은 쿠팡파트너스…"라 광고 느낌이 너무 강했다.
 * 공정위 「추천·보증 등에 관한 표시·광고 심사지침」의 "동영상 내 표시"는 쇼츠·릴스
 * 화면 하단에 영상 내내 떠 있는 고지(TemplateD Disclosure · TemplateE DisclosureTag)가
 * 채운다. 그래서 첫 줄은 본문에 내주고, 쿠팡파트너스 정책상 게시물에 있어야 하는
 * 고지 문구는 본문 바로 뒤에 그대로(문구 변경 없이) 둔다. 링크 페이지 상단 고지도 유지.
 * 롱폼(longform.ts)은 화면 고지가 영상 내내 있지 않아 설명란 첫 줄을 유지한다.
 */
import { DISCLOSURE_LINE } from "./ai";
import { OWN_DISCLOSURE_LINE } from "./ownProducts";

/** 사장님 본인 상품(lib/ownProducts.ts)이면 파트너스 고지 대신 판매자 고지를 쓴다 */
type CopyOpts = { own?: boolean };
/** 본인 상품 본문에서 빼는 파트너스용 문장 (사실이 아니게 된다) */
const PARTNER_ONLY_SENTENCE = "쿠팡에서 찾은 살림템을 번호로 정리하고 있어요.";

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
  variant: ShortsVariant = "classic",
  opts: CopyOpts = {}
): string {
  const url = landingUrl(displayNumber, {
    source: "youtube_shorts",
    channel: "youtube",
    templateVariant: variant,
  });

  return [
    shortProductName,
    "",
    opts.own ? OWN_DISCLOSURE_LINE : DISCLOSURE_LINE,
    "",
    `제품명·가격·상세 정보는 살림템 메모장 ${displayNumber}번에 정리했습니다.`,
    url,
    "",
    // 채널 프로필 링크는 이 번호 하나가 아니라 최근 상품을 모은 허브
    // (/from/youtube-shorts)를 가리킨다 - "같은 주소"라고 하면 부정확하다.
    "채널 프로필 첫 화면에서도 최근 번호들을 확인하실 수 있어요.",
    "",
    opts.own ? "#Shorts #근사장 #쿠팡" : "#Shorts #살림템 #생활템 #쿠팡추천템",
  ].join("\n");
}

/**
 * 인스타그램 릴스 캡션.
 *
 * 접힌 상태에서 보이는 첫 줄은 본문 첫 문장, 고지는 본문 바로 뒤(해시태그 앞).
 * 본문(AI 생성분)에 고지가 섞여 있으면 빼고 정해진 자리에 한 번만 넣는다.
 */
export function instagramCaption(
  baseCaption: string,
  displayNumber: number,
  opts: CopyOpts = {}
): string {
  const disclosure = opts.own ? OWN_DISCLOSURE_LINE : DISCLOSURE_LINE;
  let raw = (baseCaption ?? "").split(DISCLOSURE_LINE).join("").split(OWN_DISCLOSURE_LINE).join("");
  if (opts.own) raw = raw.split(PARTNER_ONLY_SENTENCE).join("");
  const lines = raw
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n");
  // 끝에 붙은 해시태그 줄은 고지 뒤로 보낸다
  const tags: string[] = [];
  while (lines.length && /^\s*(#\S+\s*)+$/.test(lines[lines.length - 1])) {
    tags.unshift(lines.pop()!.trim());
  }
  const body = lines.join("\n").trim();

  // 본문이 통째로 비어 있는 경우(문구 생성 실패)에도 최소한의 안내는 나가야 한다.
  const fallback = `프로필 첫 화면에 최근 번호 정리해 뒀어요. (${displayNumber}번)`;
  return [body || fallback, "", disclosure, ...(tags.length ? ["", ...tags] : [])].join("\n");
}

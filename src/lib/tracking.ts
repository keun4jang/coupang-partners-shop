/**
 * 링크 성과 추적 (product_event_daily).
 *
 * 왜 필요한가: 실측 CTR 이 0.08% 수준(조회 17,246 → 쿠팡 도달 14건)인데,
 * 기존 click_logs 로는 "어느 채널의 어떤 영상에서 온 방문이 실제로 링크까지
 * 갔는지"를 나눠 볼 수 없었다. 개선을 해도 좋아졌는지 판단할 근거가 없다.
 *
 * 설계 원칙:
 *  · raw 로그를 쌓지 않는다. "날짜 × 번호 × 이벤트 × 유입경로" 카운터만 올린다.
 *    (무료 티어 용량 + 개인정보 최소 수집)
 *  · 쿼리스트링 값은 누구나 조작할 수 있으므로 화이트리스트로만 받는다.
 *  · 집계 실패가 사용자 이동을 절대 막지 않는다. 매출 동선 > 통계.
 */
import { supabaseAdmin } from "./supabase";
import { optionalEnv } from "./env";

/** 유입 경로 (어느 영상 포맷에서 왔나) */
export const EVENT_SOURCES = [
  "youtube_shorts",
  "instagram_reels",
  "youtube_longform",
  "facebook_reels",
  "site",
  "unknown",
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** 유입 채널 */
export const EVENT_CHANNELS = [
  "youtube",
  "instagram",
  "facebook",
  "site",
  "unknown",
] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];

/** 영상 템플릿 변형 (A/B 비교 축) */
export const TEMPLATE_VARIANTS = ["classic", "usecase", "top10", "unknown"] as const;
export type TemplateVariant = (typeof TEMPLATE_VARIANTS)[number];

export type EventType = "landing_view" | "outbound_click";

export interface TrackingParams {
  source: EventSource;
  channel: EventChannel;
  videoId: string;
  templateVariant: TemplateVariant;
  rank: number;
}

/**
 * 공개 사이트 주소.
 *
 * env.ts 의 siteUrl() 은 값이 없으면 localhost 로 떨어지는데, 이 함수의 결과는
 * 유튜브 설명란·인스타 캡션에 그대로 박힌다. 워커(GitHub Actions)에
 * NEXT_PUBLIC_SITE_URL 이 없으면 "localhost 링크가 발행된 영상에 영구히 남는"
 * 사고가 되므로, 여기서는 운영 도메인으로 떨어지게 한다.
 */
const PRODUCTION_SITE_URL = "https://momitemmom.vercel.app";
export function publicSiteUrl(): string {
  const configured = optionalEnv("NEXT_PUBLIC_SITE_URL")?.replace(/\/$/, "");
  if (configured && !configured.includes("localhost")) return configured;
  return PRODUCTION_SITE_URL;
}

function pickFrom<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
  fallback: T
): T {
  const v = (value ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 유튜브 videoId 처럼 짧은 식별자만 통과시킨다 (그 외 문자는 버림) */
function cleanVideoId(value: string | null | undefined): string {
  return (value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

function cleanRank(value: string | null | undefined): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 0;
}

/**
 * URL 쿼리스트링에서 추적 정보를 뽑는다.
 * 값이 없거나 허용 목록 밖이면 unknown 으로 떨어뜨린다(요청을 거부하지 않는다).
 */
export function parseTrackingParams(params: URLSearchParams): TrackingParams {
  return {
    source: pickFrom(EVENT_SOURCES, params.get("src"), "unknown"),
    channel: pickFrom(EVENT_CHANNELS, params.get("channel"), "unknown"),
    videoId: cleanVideoId(params.get("vid")),
    templateVariant: pickFrom(TEMPLATE_VARIANTS, params.get("tpl"), "unknown"),
    rank: cleanRank(params.get("rank")),
  };
}

/**
 * 일일 카운터 +1.
 *
 * 절대 throw 하지 않는다. 호출한 쪽(리다이렉트·페이지 렌더)이 이 함수 때문에
 * 멈추면 안 되기 때문이다. 실패는 서버 로그로만 남긴다.
 * 마이그레이션 전이면 함수가 없어 오류가 나는데, 그때도 조용히 넘어간다.
 */
export async function recordProductEvent(input: {
  displayNumber: number;
  eventType: EventType;
  tracking: TrackingParams;
}): Promise<void> {
  const { displayNumber, eventType, tracking } = input;
  if (!Number.isFinite(displayNumber) || displayNumber <= 0) return;

  try {
    const { error } = await supabaseAdmin().rpc("increment_product_event_daily", {
      p_display_number: displayNumber,
      p_event_type: eventType,
      p_source: tracking.source,
      p_channel: tracking.channel,
      p_video_id: tracking.videoId,
      p_template_variant:
        tracking.templateVariant === "unknown" ? "" : tracking.templateVariant,
      p_rank_in_video: tracking.rank,
    });
    if (error) {
      console.warn(`성과 집계 실패(무시): ${error.message.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`성과 집계 실패(무시): ${(e as Error).message.slice(0, 200)}`);
  }
}

/** 숏폼 템플릿 변형 (A/B 비교의 두 갈래) */
export type ShortsVariant = "classic" | "usecase";

/**
 * video_item 이 어떤 변형으로 만들어졌는지.
 * 마이그레이션 적용 전에는 template_variant 컬럼이 없어 undefined 가 오는데,
 * 그때도 기존 동작(classic)으로 떨어지게 한다.
 */
export function shortsVariantOf(item: {
  template_variant?: string | null;
}): ShortsVariant {
  return item.template_variant === "usecase" ? "usecase" : "classic";
}

/** 추적 파라미터를 쿼리스트링으로 (빈 값은 넣지 않아 링크를 짧게 유지) */
export function trackingQuery(opts: {
  source: EventSource;
  channel: EventChannel;
  templateVariant?: TemplateVariant;
  videoId?: string;
  rank?: number;
}): string {
  const q = new URLSearchParams();
  q.set("src", opts.source);
  q.set("channel", opts.channel);
  if (opts.templateVariant && opts.templateVariant !== "unknown") {
    q.set("tpl", opts.templateVariant);
  }
  if (opts.videoId) q.set("vid", cleanVideoId(opts.videoId));
  if (opts.rank && opts.rank >= 1 && opts.rank <= 10) q.set("rank", String(opts.rank));
  return q.toString();
}

/** 설명란·캡션에 넣을 N번 랜딩 주소 */
export function landingUrl(
  displayNumber: number,
  opts: Parameters<typeof trackingQuery>[0]
): string {
  return `${publicSiteUrl()}/n/${displayNumber}?${trackingQuery(opts)}`;
}

/** 제휴 링크로 바로 나가는 추적 경유 주소 (롱폼 설명란 등) */
export function outboundUrl(
  displayNumber: number,
  opts: Parameters<typeof trackingQuery>[0]
): string {
  return `${publicSiteUrl()}/go/${displayNumber}?${trackingQuery(opts)}`;
}

/**
 * 프로필 링크 허브 (링크 클릭률 개선 2차).
 *
 * 인스타/유튜브/페이스북 프로필의 "웹사이트" 링크를 사이트 루트가 아니라
 * 이 페이지들로 바꿔 달게 한다. 프로필로 넘어온 사람이 번호를 직접
 * 입력하지 않아도 최근 상품을 바로 골라 /n/[번호] 로 갈 수 있게 하기 위함
 * (기존엔 프로필 → 사이트 루트 → 검색/스크롤이라 마찰이 컸다).
 */
export const HUB_PLATFORMS = ["instagram", "youtube_shorts", "facebook"] as const;
export type HubPlatform = (typeof HUB_PLATFORMS)[number];

/** 허브 플랫폼 → 상품 이동 시 남길 유입경로 태그 */
export const HUB_TRACKING: Record<HubPlatform, { source: EventSource; channel: EventChannel }> = {
  instagram: { source: "instagram_reels", channel: "instagram" },
  youtube_shorts: { source: "youtube_shorts", channel: "youtube" },
  facebook: { source: "facebook_reels", channel: "facebook" },
};

export function isHubPlatform(value: string): value is HubPlatform {
  return (HUB_PLATFORMS as readonly string[]).includes(value);
}

/**
 * 허브 페이지 방문 1건 기록 (번호와 무관한 상위 퍼널 지표).
 * recordProductEvent 와 같은 원칙: 절대 throw 하지 않는다.
 */
export async function recordProfileHubView(platform: HubPlatform): Promise<void> {
  try {
    const { error } = await supabaseAdmin().rpc("increment_profile_hub_view_daily", {
      p_platform: platform,
    });
    if (error) {
      console.warn(`허브 방문 집계 실패(무시): ${error.message.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`허브 방문 집계 실패(무시): ${(e as Error).message.slice(0, 200)}`);
  }
}

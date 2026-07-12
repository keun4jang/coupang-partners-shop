/**
 * 영상 템플릿 설정 파일.
 * "디자인 수정" 요청 시 이 파일의 값을 우선 조정한다.
 * 폰트 크기 / 자막 위치 / 색상 / 모션 속도 / CTA 문구를 여기서 바꿀 수 있다.
 */

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** 기본 길이(초). 8~12초 범위 안에서 조정 */
  durationSeconds: 10,
} as const;

export const DURATION_IN_FRAMES = VIDEO.durationSeconds * VIDEO.fps;

/** 장면 타이밍 (초 단위) */
export const TIMING = {
  hook: { from: 0, to: 1.5 },
  empathy: { from: 1.5, to: 3.5 },
  product: { from: 3.5, to: 6.5 },
  benefit2: { from: 6.5, to: 8.5 },
  cta: { from: 8.5, to: 10 },
} as const;

/** 베이지/살구톤 팔레트 (사이트와 톤 일치) */
export const COLORS = {
  cream: "#FFF8F0",
  card: "#FFFFFF",
  primary: "#D98C5F",
  primaryDark: "#C47A4E",
  ink: "#3F342C",
  sub: "#7A6A5F",
  accent: "#F5C7A9",
  accentSoft: "#FBE9DB",
  overlayTintTop: "rgba(63, 52, 44, 0.18)",
  overlayTintBottom: "rgba(63, 52, 44, 0.45)",
  subtitleShadow: "rgba(63, 52, 44, 0.35)",
} as const;

export const FONT_SIZES = {
  hook: 82,
  subtitle: 62,
  productName: 44,
  benefit: 56,
  ctaNumber: 150,
  ctaText: 58,
  disclosure: 28,
  badge: 34,
} as const;

/** 모션 속도/강도 */
export const MOTION = {
  /** 배경 줌 시작→끝 배율 */
  bgZoomFrom: 1.0,
  bgZoomTo: 1.12,
  /** 자막 팝인 스프링 */
  springDamping: 12,
  springMass: 0.8,
  /** 줌 펄스 주기(초) - 0.8~1.5초마다 시각 변화 요구사항 */
  pulseSeconds: 1.2,
  pulseScale: 0.02,
  /** 제품 카드 등장 스프링 */
  productDamping: 14,
} as const;

/** CTA 문구 템플릿 (번호는 "17번"처럼 앞자리 0 없이) */
export const ctaTemplate = (displayNumber: number): string =>
  `영상 속 제품은 ${displayNumber}번에 정리해뒀어요`;

export const CTA_SUB_TEXT = "프로필 링크에서 번호로 검색";

/** 하단 대가성 문구 (모든 영상에 항상 표시) */
export const DISCLOSURE_TEXT =
  "쿠팡파트너스 활동으로 수수료를 받을 수 있습니다.";

/**
 * 카테고리별 B-roll 후보 파일 (public/assets/broll/ 아래).
 * 파일이 없으면 그라디언트 모션 배경으로 자동 대체된다.
 */
export const BROLL_BY_CATEGORY: Record<string, string[]> = {
  차량용품: ["car.mp4", "driving.mp4", "car-interior.mp4"],
  청소템: ["cleaning.mp4", "bathroom.mp4", "sink.mp4", "tiles.mp4"],
  수납템: ["storage.mp4", "room.mp4", "organizing.mp4"],
  주방템: ["kitchen.mp4", "cooking.mp4", "sink.mp4"],
  자취템: ["small-room.mp4", "desk.mp4", "daily-life.mp4"],
  육아생활템: ["kids-room.mp4", "family-home.mp4", "organizing.mp4"],
  생활템: ["daily-life.mp4", "room.mp4", "organizing.mp4"],
  반려동물: ["pet.mp4", "home.mp4", "cleaning.mp4"],
  뷰티: ["bathroom.mp4", "mirror.mp4", "skincare.mp4"],
  캠핑: ["outdoor.mp4", "camping.mp4"],
};

/** 템플릿별 상단 배지 문구 */
export const TEMPLATE_BADGE: Record<"A" | "B" | "C", string | null> = {
  A: null,
  B: "아이 둘 키우는 집 메모 🏡",
  C: "오늘의 살림 메모 ✍️",
};

export const secondsToFrames = (s: number): number => Math.round(s * VIDEO.fps);

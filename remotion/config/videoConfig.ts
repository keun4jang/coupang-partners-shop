/**
 * 영상 템플릿 설정 파일.
 * "디자인 수정" 요청 시 이 파일의 값을 우선 조정한다.
 * 폰트 크기 / 자막 위치 / 색상 / 모션 속도 / CTA 문구를 여기서 바꿀 수 있다.
 */

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  /**
   * 기본 길이(초) - 나레이션 타이밍(timing props)이 없을 때의 폴백.
   * 고정 TIMING(아래) 의 cta.to 와 일치해야 폴백 시 마지막 장면이 잘리지 않는다.
   * 실제 길이는 워커가 나레이션 실측 길이로 계산해 18초 안팎으로 맞춘다.
   */
  durationSeconds: 18,
} as const;

export const DURATION_IN_FRAMES = VIDEO.durationSeconds * VIDEO.fps;

/**
 * 릴스/틱톡/쇼츠 UI가 가리는 상·하단 데드존 (화면 높이 비율).
 * 핵심 요소(자막·제품카드·번호)는 이 영역을 피해 가운데 안전대에 배치한다.
 *  - top:    상태바 / "Reels" 라벨 / 우상단 카메라
 *  - bottom: 캡션·계정명·오디오·좋아요/댓글/공유 버튼·진행바
 */
export const SAFE_ZONE = {
  top: 0.12,
  bottom: 0.2,
} as const;

/** 요소 세로 배치값 (데드존 반영). "위치가 이상하다" 류 요청은 여기서 조정. */
export const LAYOUT = {
  /** 상단 배지 위치(px). 상태바 아래, 상단 중앙(UI가 적은 영역) */
  topBadgeTop: 130,
  /** 제품 카드 상단 위치(화면 높이 비율). 위 자막과 붙이고 번호를 안전대 안에 둔다 */
  productCardTop: 0.3,
  /** 제품 카드 가로 폭(화면 너비 비율) */
  productCardWidth: 0.54,
  /** 제품 장면 상단 자막(장점) 세로 위치 */
  captionTop: 0.15,
  /** 하단 대가성 문구 위치(하단에서 px). 하단 데드존 위 경계 */
  disclosureBottom: Math.round(VIDEO.height * SAFE_ZONE.bottom),
} as const;

/**
 * 고정 장면 타이밍 (초) - 나레이션 timing props 가 없을 때의 폴백 (약 18초 기준).
 * product = 장점1 장면(제품 카드 등장). benefit2 = 장점2. review = 후기.
 */
export const TIMING = {
  hook: { from: 0, to: 2.2 },
  empathy: { from: 2.2, to: 4.6 },
  product: { from: 4.6, to: 8.0 },
  benefit2: { from: 8.0, to: 11.0 },
  review: { from: 11.0, to: 14.0 },
  cta: { from: 14.0, to: 17.5 },
} as const;

/** 장면 구간 형태 (템플릿에서 사용) */
export type SceneRanges = {
  hook: { from: number; to: number };
  empathy: { from: number; to: number };
  /** 장점1 (제품 카드 등장 장면) */
  product: { from: number; to: number };
  /** 장점2 */
  benefit2: { from: number; to: number };
  /** 후기 */
  review: { from: number; to: number };
  cta: { from: number; to: number };
};

/** timing props(누적 종료시각) → 장면 구간. 없으면 고정 TIMING */
export function resolveTiming(t?: {
  hookTo: number;
  empathyTo: number;
  benefit1To: number;
  benefit2To: number;
  reviewTo: number;
  ctaTo: number;
} | null): SceneRanges {
  if (!t) return TIMING;
  return {
    hook: { from: 0, to: t.hookTo },
    empathy: { from: t.hookTo, to: t.empathyTo },
    product: { from: t.empathyTo, to: t.benefit1To },
    benefit2: { from: t.benefit1To, to: t.benefit2To },
    review: { from: t.benefit2To, to: t.reviewTo },
    cta: { from: t.reviewTo, to: t.ctaTo },
  };
}

/**
 * 스톡 영상 배경 위에 덮는 크림색 베일 - 배경에 시선이 쏠리지 않게.
 * opacity 0 = 원본 그대로, 1 = 완전히 가림.
 */
export const BROLL_VEIL = {
  opacity: 0.25,
} as const;

/**
 * 배경음악 (퍼블릭 도메인: Scott Joplin - The Entertainer, Wikimedia Commons /
 * 상업 이용 제한 없음). 밝고 가벼운 래그타임 피아노.
 * volume 은 나레이션을 가리지 않도록 아주 낮게 유지.
 */
export const BGM = {
  file: "assets/bgm/happy-entertainer.mp3",
  volume: 0.1,
  /** 끝부분 페이드아웃(초) */
  fadeOutSeconds: 1.2,
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
  /** 자막 팝인 스프링 */
  springDamping: 12,
  springMass: 0.8,
  /** 제품 카드 등장 스프링 */
  productDamping: 14,
} as const;

/** CTA 문구 템플릿 (번호는 "17번"처럼 앞자리 0 없이) */
export const ctaTemplate = (displayNumber: number): string =>
  `영상 속 제품은 프로필 링크 ${displayNumber}번에 정리해뒀어요`;

export const CTA_SUB_TEXT = "프로필 링크에서 번호로 검색";

/** CTA 화면 신뢰 문구 - 큐레이션 기준을 진실하게 전달 (허위 사용 후기 아님) */
export const TRUST_TEXT = "가성비 좋고 후기까지 확인한 제품만 골라요";

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

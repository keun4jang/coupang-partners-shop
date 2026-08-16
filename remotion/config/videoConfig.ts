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
   * 실제 길이는 워커가 나레이션 실측 길이로 계산한다 (7장면 대본 기준 22~28초 안팎).
   */
  durationSeconds: 21,
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
 * 고정 장면 타이밍 (초) - 나레이션 timing props 가 없을 때의 폴백 (약 21초 기준).
 * product = 장점1 장면(제품 카드 등장). benefit2 = 장점2. tip = 사용팁. review = 후기.
 */
export const TIMING = {
  hook: { from: 0, to: 2.2 },
  empathy: { from: 2.2, to: 4.6 },
  product: { from: 4.6, to: 8.0 },
  benefit2: { from: 8.0, to: 10.8 },
  tip: { from: 10.8, to: 13.6 },
  review: { from: 13.6, to: 16.4 },
  cta: { from: 16.4, to: 21.0 },
} as const;

/** 장면 구간 형태 (템플릿에서 사용) */
export type SceneRanges = {
  hook: { from: number; to: number };
  empathy: { from: number; to: number };
  /** 장점1 (제품 카드 등장 장면) */
  product: { from: number; to: number };
  /** 장점2 */
  benefit2: { from: number; to: number };
  /** 사용팁 */
  tip: { from: number; to: number };
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
  tipTo: number;
  reviewTo: number;
  ctaTo: number;
} | null): SceneRanges {
  if (!t) return TIMING;
  return {
    hook: { from: 0, to: t.hookTo },
    empathy: { from: t.hookTo, to: t.empathyTo },
    product: { from: t.empathyTo, to: t.benefit1To },
    benefit2: { from: t.benefit1To, to: t.benefit2To },
    tip: { from: t.benefit2To, to: t.tipTo },
    review: { from: t.tipTo, to: t.reviewTo },
    cta: { from: t.reviewTo, to: t.ctaTo },
  };
}

/**
 * 스톡 영상 배경 위에 덮는 크림색 베일 - 배경에 시선이 쏠리지 않게.
 * opacity 0 = 원본 그대로, 1 = 완전히 가림.
 */
export const BROLL_VEIL = {
  opacity: 0,
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

/**
 * 살림템 감성 팔레트 (따뜻한 아이보리/베이지/살구/민트).
 * "30~50대 주부가 저장하고 싶은 따뜻한 생활용품 광고" 톤 - 남성적 파랑/검정 배제.
 */
export const PALETTE = {
  ivory: "#FFF7EC", // 배경 아이보리
  warmBeige: "#F3E3CF", // 따뜻한 베이지
  softPeach: "#FFD8C2", // 부드러운 살구
  sageMint: "#DDEBDD", // 세이지 민트
  cardCream: "#FFF8EF", // 제품 카드 크림
  productBlue: "#3F8FD9", // 제품(파란통) 포인트
  brown: "#2F2722", // 진한 브라운 텍스트
  sub: "#7A6A5D", // 보조 텍스트
  badgeCoral: "#FF8A70", // 배지 코랄
} as const;

/** 베이지/살구톤 팔레트 (사이트와 톤 일치) */
export const COLORS = {
  cream: PALETTE.ivory,
  card: PALETTE.cardCream,
  primary: "#D98C5F",
  primaryDark: "#C47A4E",
  ink: PALETTE.brown,
  sub: PALETTE.sub,
  accent: "#F5C7A9",
  accentSoft: "#FBE9DB",
  overlayTintTop: "rgba(63, 52, 44, 0.18)",
  overlayTintBottom: "rgba(63, 52, 44, 0.5)",
  subtitleShadow: "rgba(63, 52, 44, 0.32)",
} as const;

export const FONT_SIZES = {
  // 훅은 스크롤을 멈추게 하는 첫 문장 - 일반 자막보다 확실히 크게
  hook: 62,
  subtitle: 46,
  productName: 58, // 제품명 - 정보 위계 최상위(크게)
  benefit: 46,
  ctaNumber: 150,
  ctaText: 58,
  disclosure: 28,
  badge: 34,
  // 재설계 요소 (살림템 쇼케이스)
  tipLabel: 30, // 상단 "보관 TIP" 라벨
  volumeBadge: 32, // 카드 상단 "19L 대용량" 배지
  numberBadge: 36, // "오늘의 살림템 28번" 배지
  subInfo: 34, // 보조 정보(대용량 등)
  // 첫 프레임 썸네일용 - 피드/그리드에서 손톱만 하게 보여도 읽히게 아주 크게
  coverBadge: 46,
  coverHook: 104,
} as const;

/**
 * 훅 자막 크기를 문구 길이에 맞춰 최대한 크게 잡는다.
 *
 * 왜 고정값이 아닌가: 실측상 인스타 릴스 평균 시청이 2.72초(스킵율 80.5%)라
 * 시청자가 보는 건 사실상 훅 한 줄뿐이다. 그래서 최대한 키워야 하는데,
 * 훅 길이가 12~24자로 편차가 커서 고정값을 키우면 긴 훅이 3줄이 되고
 * 바로 아래 공감 자막(y=0.4)과 겹친다.
 *
 * 훅은 y=0.26, 공감은 y=0.4 → 사이 간격 0.14 × 1920 = 269px.
 * lineHeight 1.2 기준 2줄까지만 허용해야 안 겹친다(2줄 = 크기 × 2.4).
 * 한글 글자폭은 대략 1em, 자막 폭은 화면의 86%(929px)이므로
 * 2줄에 들어가려면  크기 ≤ 929 ÷ (글자수 ÷ 2) = 1858 ÷ 글자수.
 * 안전 계수 0.92를 곱하고 62~96 사이로 자른다.
 */
export function hookFontSize(hookLine: string): number {
  const n = Math.max(1, (hookLine ?? "").trim().length);
  const fit = (1858 / n) * 0.92;
  return Math.round(Math.min(96, Math.max(62, fit)));
}

/**
 * 영상 첫 프레임(정확히 1프레임)을 썸네일처럼 쓰기 위한 정적 커버 화면 길이.
 * 재생 중엔 1/30초라 거의 안 보이고, 플랫폼이 이 프레임을 미리보기로 캡처하거나
 * 우리가 직접 썸네일 PNG로 뽑을 때(worker THUMBNAIL_FRAME) 이 화면이 나온다.
 */
export const COVER_FRAME_COUNT = 1;

/** 모션 속도/강도 */
export const MOTION = {
  /** 자막 팝인 스프링 */
  springDamping: 12,
  springMass: 0.8,
  /** 제품 카드 등장 스프링 */
  productDamping: 14,
} as const;

/** CTA 문구 템플릿 (ctaText 미전달 시 폴백 - 워커는 ai.ts ctaLine 변형을 넘긴다) */
export const ctaTemplate = (_displayNumber: number): string =>
  `영상 속 제품은 프로필 링크에 정리해 뒀어요`;

export const CTA_SUB_TEXT = "프로필 링크에 제품 정보";

/** CTA 화면 신뢰 문구 - 큐레이션 기준을 진실하게 전달 (허위 사용 후기 아님) */
export const TRUST_TEXT = "가성비 좋고 후기까지 확인한 제품만 골라요";

/** 하단 대가성 문구 (모든 영상에 항상 표시) */
export const DISCLOSURE_TEXT =
  "쿠팡파트너스 활동으로 수수료를 받을 수 있습니다.";

/**
 * (사용 안 함) 카테고리별 B-roll 후보 파일 목록이었다.
 *
 * 여기 적힌 30개 파일(car.mp4, cleaning.mp4 …)은 실제로 만들어진 적이 없다.
 * 2026-08-05 확인: public/assets/broll 에 존재하는 개수 0/30.
 * 실제 배경은 렌더 시점에 Pexels/Pixabay 에서 받아오고(src/lib/broll.ts
 * fetchStockBrolls), 받은 파일은 pexels-<id>.mp4 형식이라 이 목록과 이름이 다르다.
 *
 * 그래서 이 매핑을 참조하던 pickBrollFile() 은 항상 null 을 돌려주고 있었다.
 * 파일명만 채워 넣어 되살리는 건 권하지 않는다 - 받아둔 클립에는 카테고리 정보가
 * 없어서, 차량 상품에 주방 영상이 깔리는 식의 엇갈림이 생긴다. 엇갈린 배경보다
 * 중립적인 블러 배경이 낫다는 판단으로 이 경로를 걷어냈다.
 */

/** 템플릿별 상단 배지 문구 */
export const TEMPLATE_BADGE: Record<"A" | "B" | "C", string | null> = {
  A: null,
  B: "아이 둘 키우는 집 메모 🏡",
  C: "오늘의 살림 메모 ✍️",
};

export const secondsToFrames = (s: number): number => Math.round(s * VIDEO.fps);

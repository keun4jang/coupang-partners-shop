/**
 * 장면 컷 타이밍 (초, 누적 종료 시각).
 * 워커가 나레이션 실측 길이에 맞춰 계산해 전달한다.
 * 없으면(null) videoConfig 의 고정 TIMING 을 쓴다.
 */
export type SceneTiming = {
  hookTo: number;
  empathyTo: number;
  /** 장점1 장면 종료 */
  benefit1To: number;
  /** 장점2 장면 종료 */
  benefit2To: number;
  /** 후기 장면 종료 */
  reviewTo: number;
  /** = 영상 전체 길이(초) */
  ctaTo: number;
};

/** 숏폼 렌더링 입력 props (워커가 video_item 에서 만들어 전달) */
export type ShortsProps = {
  displayNumber: number;
  productName: string;
  /** 후킹 문구(타겟 호명) */
  hookLine: string;
  /** 공감 문장(문제) */
  empathyLine: string;
  /** 장점 1 */
  benefit1: string;
  /** 장점 2 (다른 각도의 장점) */
  benefit2: string;
  /** 후기 언급(사회적 증거) */
  reviewLine: string;
  /** CTA (예: 영상 속 제품은 17번에 정리해뒀어요) */
  ctaText: string;
  productImageUrl: string | null;
  category: string;
  /** public/assets/broll/ 아래 B-roll 파일명. 없으면 그라디언트 모션 배경 */
  brollFile: string | null;
  /** (포맷 D) 4컷 배경용 스톡 클립 파일명 목록 - 장면 경계마다 다음 클립으로 전환 */
  brollFiles?: string[] | null;
  /**
   * 장면별 나레이션 오디오 (data URI mp3).
   * 순서: [후킹, 공감, 장점1, 장점2, 후기, CTA]. null 이면 해당 장면 무음.
   */
  narration?: (string | null)[] | null;
  /** 나레이션 길이에 맞춘 장면 컷 타이밍. 없으면 고정 TIMING 사용 */
  timing?: SceneTiming | null;
};

export const defaultShortsProps: ShortsProps = {
  displayNumber: 17,
  productName: "차량용 미니 청소기",
  hookLine: "신랑 차에 부스러기 자꾸 쌓이면",
  empathyLine: "치우기 은근 번거롭잖아요",
  benefit1: "차에 하나 놔주면 괜찮아 보여요",
  benefit2: "작아서 신랑도 부담 없이 쓸 것 같고요",
  reviewLine: "후기도 많고 평이 괜찮아 보이더라고요",
  ctaText: "영상 속 제품은 17번에 정리해뒀어요",
  productImageUrl: null,
  category: "차량용품",
  brollFile: null,
  brollFiles: null,
  narration: null,
  timing: null,
};

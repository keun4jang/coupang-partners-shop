/**
 * 장면 컷 타이밍 (초, 누적 종료 시각).
 * 워커가 나레이션 실측 길이에 맞춰 계산해 전달한다.
 * 없으면(null) videoConfig 의 고정 TIMING 을 쓴다.
 */
export type SceneTiming = {
  hookTo: number;
  empathyTo: number;
  productTo: number;
  benefit2To: number;
  /** = 영상 전체 길이(초) */
  ctaTo: number;
};

/** 숏폼 렌더링 입력 props (워커가 video_item 에서 만들어 전달) */
export type ShortsProps = {
  displayNumber: number;
  productName: string;
  /** 0~1.5초 후킹 문구 */
  hookLine: string;
  /** 1.5~3.5초 공감 문장 */
  empathyLine: string;
  /** 3.5~6.5초 장점 1 */
  benefit1: string;
  /** 6.5~8.5초 장점 2 / 사용 상황 */
  benefit2: string;
  /** 8.5~10초 CTA (예: 영상 속 제품은 17번에 정리해뒀어요) */
  ctaText: string;
  productImageUrl: string | null;
  category: string;
  /** public/assets/broll/ 아래 B-roll 파일명. 없으면 그라디언트 모션 배경 */
  brollFile: string | null;
  /** (포맷 D) 4컷 배경용 스톡 클립 파일명 목록 - 장면 경계마다 다음 클립으로 전환 */
  brollFiles?: string[] | null;
  /**
   * 장면별 나레이션 오디오 (data URI mp3).
   * 순서: [후킹, 공감, 장점1, 장점2, CTA]. null 이면 해당 장면 무음.
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
  ctaText: "영상 속 제품은 17번에 정리해뒀어요",
  productImageUrl: null,
  category: "차량용품",
  brollFile: null,
  brollFiles: null,
  narration: null,
  timing: null,
};

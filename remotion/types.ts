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
  /**
   * 장면별 나레이션 오디오 (data URI mp3).
   * 순서: [후킹, 공감, 장점1, 장점2, CTA]. null 이면 해당 장면 무음.
   */
  narration?: (string | null)[] | null;
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
  narration: null,
};

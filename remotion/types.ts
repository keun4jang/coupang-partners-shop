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
  /** 사용팁 장면 종료 */
  tipTo: number;
  /** 확인할 점 장면 종료 (필드명은 예전 "후기" 슬롯 시절 그대로 - 타이밍 키라 유지) */
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
  /** 사용팁/활용법 - 생활 속에서 어떻게 쓰면 좋은지 (구버전 대본엔 없어서 null 허용) */
  usageTip: string | null;
  /** 확인할 점 - 사이즈·설치 방식·재질 등 (근거 없는 후기 언급을 대체한 슬롯) */
  checkPoint: string;
  /** CTA (예: 영상 속 제품은 17번에 정리해뒀어요) */
  ctaText: string;
  productImageUrl: string | null;
  category: string;
  /** public/assets/broll/ 아래 B-roll 파일명. 없으면 그라디언트 모션 배경 */
  brollFile: string | null;
  /** (포맷 D) 4컷 배경용 스톡 클립 파일명 목록 - 장면 경계마다 다음 클립으로 전환 */
  brollFiles?: string[] | null;
  /** brollFiles 각 클립의 길이(초). 컷 구간보다 짧으면 Loop 로 이어 붙인다. */
  brollDurations?: number[] | null;
  /**
   * 배경 클립 위에 띄울 안내 라벨 ("사용 상황 예시" / "연출 화면").
   *
   * 우리가 쓰는 배경은 스톡 또는 연출 소재라 "실제로 그 제품을 쓰는 장면"이
   * 아니다. 라벨이 없으면 시청자가 제품 사용 영상으로 오해할 수 있어
   * (표시광고법상 오인 소지) 화면 안에 작게 붙인다.
   * null 이면 라벨을 띄우지 않는다 - 실사용 영상이 확인된 경우에만.
   */
  brollNotice?: string | null;
  /**
   * 장면별 나레이션 오디오 (data URI mp3).
   * 순서: [후킹, 공감, 장점1, 장점2, 사용팁, 확인할 점, CTA] (7개, 사용팁 없으면 null).
   * null 이면 해당 장면 무음.
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
  usageTip: "시트 틈새랑 컵홀더까지 구석구석 밀어주면 돼요",
  checkPoint: "시트 사이 폭이 맞는지 먼저 재보면 좋아요",
  ctaText: "영상 속 제품은 프로필 링크에 정리해 뒀어요",
  productImageUrl: null,
  category: "차량용품",
  brollFile: null,
  brollFiles: null,
  brollDurations: null,
  brollNotice: "사용 상황 예시",
  narration: null,
  timing: null,
};

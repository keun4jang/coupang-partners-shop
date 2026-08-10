// DB 행 타입 정의 (Supabase 컬럼은 snake_case)

export type ProductStatus = "candidate" | "paused";
/** rendered = 렌더·드라이브 업로드 완료, SNS 발행은 예약 시간 대기 */
export type VideoStatus =
  | "pending"
  | "generating"
  | "rendered"
  | "completed"
  | "failed";
export type TemplateType = "A" | "B" | "C" | "D";
/** auto: 슬롯 시간에 렌더+발행 / immediate: 즉시 발행 / scheduled: 즉시 렌더→슬롯 발행 */
export type PublishMode = "auto" | "immediate" | "scheduled";

export interface Product {
  id: string;
  product_name: string;
  category: string;
  target_user: string | null;
  pain_point: string | null;
  main_benefit: string | null;
  price_text: string | null;
  coupang_partner_url: string;
  image_url: string | null;
  source_memo: string | null;
  status: ProductStatus;
  /** 자동 소싱된 상품 영상 캐시 (알리 매칭 등) */
  source_video_url: string | null;
  source_video_origin: string | null;
  source_video_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoItem {
  id: string;
  display_number: number;
  product_id: string;
  hook_text: string | null;
  script_text: string | null;
  caption_text: string | null;
  template_type: TemplateType;
  video_status: VideoStatus;
  publish_mode: PublishMode;
  drive_video_url: string | null;
  /** 예약 발행 시 드라이브에서 영상을 다시 받기 위한 파일 id */
  drive_video_file_id: string | null;
  drive_caption_url: string | null;
  drive_thumbnail_url: string | null;
  youtube_url: string | null;
  youtube_error: string | null;
  instagram_url: string | null;
  instagram_error: string | null;
  facebook_url: string | null;
  facebook_error: string | null;
  landing_visible: boolean;
  /** 텔레그램 "업로드" 등 수동 요청 여부 - 수동 항목은 업로드 슬롯 게이트를 우회한다 */
  manual: boolean;
  /** 스튜디오(직접 업로드 소재) - Storage 'footage' 버킷 영상 경로 목록. 있으면 이 영상을 배경으로 렌더 */
  footage_paths: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoItemWithProduct extends VideoItem {
  products: Product;
}

export interface ClickLog {
  id: string;
  video_item_id: string;
  product_id: string;
  display_number: number;
  referrer: string | null;
  user_agent: string | null;
  created_at: string;
}

/** 스튜디오 소재 (studio_ideas 행) */
export type StudioIdeaStatus = "active" | "hidden" | "used";

export interface StudioIdeaRow {
  id: string;
  coupang_product_id: number | null;
  product_name: string;
  category: string;
  price_text: string | null;
  image_url: string | null;
  coupang_url: string;
  douyin_keywords: string[];
  reason: string | null;
  status: StudioIdeaStatus;
  created_at: string;
  updated_at: string;
}

/** AI가 생성하는 문구 묶음 */
export interface VideoCopy {
  /** 타겟 호명 후킹 (예: "아이 태우고 다니는 집이라면") */
  hookText: string;
  /** 문제 공감 문장 (예: "차 안 부스러기 은근 신경 쓰이잖아요") */
  empathyLine: string;
  /** 핵심 장점 1 (예: "차에 하나 두면 바로 치울 수 있어 보여요") */
  benefit1: string;
  /** 핵심 장점 2 - 다른 각도의 장점(크기/사용 편의/다용도 등) */
  benefit2: string;
  /** 사용팁/활용법 - 생활 속에서 구체적으로 어떻게 쓰면 좋은지 */
  usageTip: string;
  /** 긍정 후기 언급 - 남들의 반응 톤 (예: "후기도 많고 평이 괜찮아 보이더라고요") */
  reviewLine: string;
  /** SNS 업로드용 캡션 전문 */
  captionText: string;
}

/** 알리익스프레스 제휴 상품 (쿠팡 products 와 별개 테이블) */
export interface AliItem {
  id: string;
  ali_product_id: string | null;
  title: string;
  image_url: string | null;
  price_text: string | null;
  /** 원본 알리 상품 URL (승인 전에는 이 주소로 나간다 - 수수료 없음) */
  product_url: string;
  /** 제휴 링크. 있으면 이쪽이 우선 */
  affiliate_url: string | null;
  commission_rate: string | null;
  landing_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

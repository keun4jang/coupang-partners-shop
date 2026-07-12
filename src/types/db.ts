// DB 행 타입 정의 (Supabase 컬럼은 snake_case)

export type ProductStatus = "candidate" | "paused";
export type VideoStatus = "pending" | "generating" | "completed" | "failed";
export type TemplateType = "A" | "B" | "C";

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
  drive_video_url: string | null;
  drive_caption_url: string | null;
  drive_thumbnail_url: string | null;
  landing_visible: boolean;
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

/** AI가 생성하는 문구 묶음 */
export interface VideoCopy {
  /** 첫 1초에 크게 보이는 후킹 문구 (예: "차 안에 부스러기 자주 떨어지면") */
  hookText: string;
  /** 공감 문장 (예: "은근 신경 쓰이잖아요") */
  empathyLine: string;
  /** 장점 1 (예: "차에 두고 쓰기 괜찮아 보여요") */
  benefit1: string;
  /** 장점 2 또는 사용 상황 (예: "작아서 보관도 부담 없고요") */
  benefit2: string;
  /** SNS 업로드용 캡션 전문 */
  captionText: string;
}

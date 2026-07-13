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
  /** 타겟 호명 후킹 (예: "아이 태우고 다니는 집이라면") */
  hookText: string;
  /** 문제 공감 문장 (예: "차 안 부스러기 은근 신경 쓰이잖아요") */
  empathyLine: string;
  /** 핵심 장점 (예: "차에 하나 두면 바로 치울 수 있어 보여요") */
  benefit1: string;
  /** 긍정 후기 언급 - 남들의 반응 톤 (예: "후기도 많고 평이 괜찮아 보이더라고요") */
  benefit2: string;
  /** SNS 업로드용 캡션 전문 */
  captionText: string;
}

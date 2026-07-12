import type { Product, TemplateType, VideoItem } from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { composeScriptText, generateVideoCopy } from "./ai";

const TEMPLATE_ROTATION: TemplateType[] = ["A", "B", "C"];

/**
 * 새 video_item 생성.
 * display_number = 현재 최대값 + 1 (unique 충돌 시 재시도).
 * 번호는 영상을 만들 때마다 계속 증가한다 - 의도된 동작.
 */
export async function createVideoItem(
  product: Product,
  templateType?: TemplateType
): Promise<VideoItem> {
  const db = supabaseAdmin();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: maxRow, error: maxError } = await db
      .from("video_items")
      .select("display_number")
      .order("display_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw new Error(`번호 조회 실패: ${maxError.message}`);

    const nextNumber = (maxRow?.display_number ?? 0) + 1;
    const template =
      templateType ?? TEMPLATE_ROTATION[nextNumber % TEMPLATE_ROTATION.length];

    const { data, error } = await db
      .from("video_items")
      .insert({
        display_number: nextNumber,
        product_id: product.id,
        template_type: template,
        video_status: "pending",
        landing_visible: false,
      })
      .select("*")
      .single();

    if (!error && data) return data as VideoItem;

    // 23505 = unique_violation (동시 생성 경합) → 번호 다시 계산해서 재시도
    if (error && error.code === "23505") continue;
    throw new Error(`video_item 생성 실패: ${error?.message}`);
  }

  throw new Error("video_item 생성 실패: 번호 할당 재시도 초과");
}

/**
 * AI 문구 생성 후 video_item 에 저장하고 링크페이지에 노출한다.
 * (AI 실패 시 ai.ts 내부에서 안전한 기본 문구로 폴백됨)
 */
export async function fillVideoCopy(
  item: VideoItem,
  product: Product
): Promise<VideoItem> {
  const copy = await generateVideoCopy(
    product,
    item.display_number,
    item.template_type
  );

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("video_items")
    .update({
      hook_text: copy.hookText,
      script_text: composeScriptText(copy, item.display_number),
      caption_text: copy.captionText,
      landing_visible: true,
    })
    .eq("id", item.id)
    .select("*")
    .single();

  if (error) throw new Error(`문구 저장 실패: ${error.message}`);
  return data as VideoItem;
}

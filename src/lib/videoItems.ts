import type { Product, TemplateType, VideoItem } from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { composeScriptText, generateVideoCopy } from "./ai";
import { selectProductsForVideos } from "./productSelector";

// 자동 로테이션은 A/B/C. D(실사용 스톡영상 배경)는 텔레그램 "영상D" 로 명시 선택.
const TEMPLATE_ROTATION: TemplateType[] = ["A", "B", "C"];

/**
 * 새 video_item 생성.
 * display_number = 현재 최대값 + 1 (unique 충돌 시 재시도).
 * 번호는 영상을 만들 때마다 계속 증가한다 - 의도된 동작.
 */
export async function createVideoItem(
  product: Product,
  templateType?: TemplateType,
  opts?: {
    /** 수동 요청(텔레그램 "업로드" 등) - 업로드 슬롯 게이트를 우회해 즉시 처리된다 */
    manual?: boolean;
  }
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
        manual: opts?.manual ?? false,
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
 * 하루치 영상(기본 3개)을 자동으로 큐에 넣는다 — 완전 자동 파이프라인용.
 *
 * - 오늘(UTC 자정 기준) 이미 target 개 이상 만들어졌으면 아무것도 하지 않는다(멱등).
 *   → cron 이 두 번 울리거나, 수동으로 몇 개 만든 날에도 하루 총량이 target 을 넘지 않음.
 * - 카테고리가 겹치지 않는 후보 상품을 골라 pending video_item 을 만든다.
 * - 실제 렌더는 렌더 워커(GitHub Actions)가 포맷 D 로 처리한다
 *   (WORKER_ENV 에 FORCE_TEMPLATE=D 설정 시).
 *
 * @returns 이번에 새로 만든 video_item 목록 (없으면 빈 배열)
 */
export async function queueDailyVideos(target = 3): Promise<VideoItem[]> {
  const db = supabaseAdmin();

  // 오늘(UTC) 이미 만든 "자동" 영상 수 → 남은 만큼만 채운다(중복 생성 방지)
  // 수동(텔레그램 업로드) 항목은 세지 않는다 - 수동으로 올려도 자동 3개는 그대로 나가야 함
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: createdToday, error: countError } = await db
    .from("video_items")
    .select("id", { count: "exact", head: true })
    .eq("manual", false)
    .gte("created_at", startOfDay.toISOString());
  if (countError) throw new Error(`오늘 생성 수 조회 실패: ${countError.message}`);

  const remaining = target - (createdToday ?? 0);
  if (remaining <= 0) return [];

  const products = await selectProductsForVideos(remaining);
  const created: VideoItem[] = [];
  for (const product of products) {
    // template_type 은 A/B/C 로 저장되지만, 렌더 시 FORCE_TEMPLATE=D 로 포맷 D 로 뽑힌다.
    const item = await createVideoItem(product);
    created.push(item);
  }
  return created;
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

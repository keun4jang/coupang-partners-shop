import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { selectProductForVideo } from "@/lib/productSelector";
import { createVideoItem, fillVideoCopy } from "@/lib/videoItems";
import type { Product, TemplateType } from "@/types/db";

export const maxDuration = 60;

/**
 * 수동 video_item 생성 요청 (관리자 페이지).
 * - productId 지정 시 해당 상품, 미지정 시 추천 기준으로 자동 선택
 * - retryVideoItemId 지정 시 실패한 영상을 다시 대기 상태로 되돌린다
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const db = supabaseAdmin();

  const retryId = String(form.get("retryVideoItemId") ?? "").trim();
  if (retryId) {
    // 재시도는 끝난 항목(failed/completed)에서만. generating(진행 중)을 되돌리면
    // 워커 점유와 겹쳐 이중 렌더가 나고, rendered(발행 대기)는 슬롯이 알아서 발행한다.
    const { data, error } = await db
      .from("video_items")
      .update({ video_status: "pending", error_message: null })
      .eq("id", retryId)
      .in("video_status", ["failed", "completed"])
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "진행 중이거나 발행 대기 중인 항목은 재시도할 수 없어요." },
        { status: 409 }
      );
    }
    return NextResponse.redirect(new URL("/admin/videos", request.url), 303);
  }

  const productId = String(form.get("productId") ?? "").trim();
  const templateRaw = String(form.get("templateType") ?? "").trim();
  const templateType = (["A", "B", "C", "D"] as const).includes(
    templateRaw as TemplateType
  )
    ? (templateRaw as TemplateType)
    : undefined;

  let product: Product | null = null;
  if (productId) {
    const { data } = await db
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();
    product = data as Product | null;
  } else {
    product = await selectProductForVideo();
  }

  if (!product) {
    return NextResponse.json(
      { error: "후보 상품이 없습니다. 먼저 상품을 등록하세요." },
      { status: 400 }
    );
  }

  const item = await createVideoItem(product, templateType);
  await fillVideoCopy(item, product);

  return NextResponse.redirect(new URL("/admin/videos", request.url), 303);
}

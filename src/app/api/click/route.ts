import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * 쿠팡 클릭 redirect.
 * /api/click?videoItemId=... → click_logs 기록 후 쿠팡파트너스 링크로 이동.
 * 같은 상품이라도 "어떤 영상 번호에서" 클릭됐는지 추적하기 위해
 * video_item_id + display_number 를 함께 기록한다.
 */
export async function GET(request: NextRequest) {
  const videoItemId = request.nextUrl.searchParams.get("videoItemId");
  if (!videoItemId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const db = supabaseAdmin();
  const { data } = await db
    .from("video_items")
    .select("*, products(*)")
    .eq("id", videoItemId)
    .maybeSingle();

  const item = data as VideoItemWithProduct | null;
  if (!item?.products?.coupang_partner_url) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { error } = await db.from("click_logs").insert({
    video_item_id: item.id,
    product_id: item.product_id,
    display_number: item.display_number,
    referrer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
  });
  if (error) {
    // 로그 실패해도 사용자 이동은 막지 않는다
    console.error("클릭 로그 저장 실패:", error.message);
  }

  return NextResponse.redirect(item.products.coupang_partner_url, 302);
}

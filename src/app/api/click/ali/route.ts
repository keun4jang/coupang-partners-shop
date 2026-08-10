import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { aliTargetUrl, getAliItem } from "@/lib/aliItems";

export const dynamic = "force-dynamic";

/**
 * 알리익스프레스 클릭 redirect.
 * /api/click/ali?itemId=...&slot=ali → ali_click_logs 기록 후 알리로 이동.
 *
 * 쿠팡용 /api/click 을 재사용하지 않은 이유: click_logs 는
 * video_item_id / product_id 가 NOT NULL 이라 영상 없는 알리 상품을 넣을 수 없다.
 *
 * 제휴 링크(affiliate_url)가 있으면 그쪽으로, 없으면 원본 상품 URL 로 보낸다.
 * (어필리에이트 승인 전에는 수수료가 붙지 않지만 클릭 수집은 그대로 된다)
 */

const SLOTS = new Set(["ali", "ali-list"]);

export async function GET(request: NextRequest) {
  const itemId = request.nextUrl.searchParams.get("itemId");
  const slotParam = request.nextUrl.searchParams.get("slot");
  const slot = slotParam && SLOTS.has(slotParam) ? slotParam : null;
  if (!itemId) return NextResponse.redirect(new URL("/", request.url));

  const item = await getAliItem(itemId);
  if (!item) return NextResponse.redirect(new URL("/", request.url));

  const { error } = await supabaseAdmin().from("ali_click_logs").insert({
    ali_item_id: item.id,
    referrer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
    slot,
  });
  // 로그 실패로 사용자 이동을 막지는 않는다
  if (error) console.error("알리 클릭 로그 저장 실패:", error.message);

  return NextResponse.redirect(aliTargetUrl(item), 302);
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withSubId } from "@/lib/coupang";
import type { VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * 쿠팡 클릭 redirect.
 * /api/click?videoItemId=...&slot=hero → click_logs 기록 후 쿠팡파트너스 링크로 이동.
 * 같은 상품이라도 "어떤 영상 번호에서" 클릭됐는지 추적하기 위해
 * video_item_id + display_number 를 함께 기록한다.
 *
 * slot: 랜딩에서 어느 자리를 눌렀는지 (hero=원탭 히어로 / list=아래 목록 /
 *       search=번호 검색 결과). 히어로가 실제로 먹히는지 판단하는 근거가 된다.
 *
 * subId: 쿠팡파트너스 링크에 영상 번호를 심어 "어느 영상이 실제로 돈을 벌었는지"를
 *        커미션 리포트에서 되짚을 수 있게 한다. 이게 없으면 수익이 한 덩어리로만
 *        보여서 클릭까지만 알고 구매는 영영 알 수 없다.
 */

/** 허용 slot 값 (임의 문자열이 DB 에 들어가지 않게 화이트리스트) */
const SLOTS = new Set(["hero", "list", "search"]);

export async function GET(request: NextRequest) {
  const videoItemId = request.nextUrl.searchParams.get("videoItemId");
  const slotParam = request.nextUrl.searchParams.get("slot");
  const slot = slotParam && SLOTS.has(slotParam) ? slotParam : null;
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

  const row = {
    video_item_id: item.id,
    product_id: item.product_id,
    display_number: item.display_number,
    referrer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
  };
  const { error } = await db.from("click_logs").insert({ ...row, slot });
  if (error) {
    // slot 컬럼 마이그레이션 전이면 컬럼 없음 오류가 날 수 있다 → 없이 재시도.
    // (로그 실패로 사용자 이동을 막지는 않는다)
    console.error("클릭 로그 저장 실패:", error.message);
    await db.from("click_logs").insert(row);
  }

  // subId 로 영상 번호를 심어 커미션 리포트에서 영상별 수익을 되짚을 수 있게 한다
  const target = withSubId(
    item.products.coupang_partner_url,
    `v${item.display_number}`
  );
  return NextResponse.redirect(target, 302);
}

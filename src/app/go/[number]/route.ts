import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withSubId } from "@/lib/coupang";
import { productTargetUrl } from "@/lib/format";
import {
  parseTrackingParams,
  recordBlockedOutbound,
  recordProductEvent,
} from "@/lib/tracking";
import { outboundSkipReason } from "@/lib/requestFilter";
import type { VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * N번 → 제휴 링크 직행 (추적 경유).
 *   /go/65?src=youtube_longform&channel=youtube&tpl=top10&rank=3
 *
 * /api/click 과 나뉘어 있는 이유: 저쪽은 랜딩 화면에서 누른 카드용이라
 * video_item 의 UUID 를 안다. 이쪽은 영상 설명란처럼 "번호밖에 없는" 자리에서
 * 쓰는 입구라 display_number 로만 상품을 찾는다.
 *
 * 대가성 고지: 이 경로를 쓰는 곳(롱폼 설명란)은 고지가 설명 맨 위에 있고,
 * 숏폼은 화면 안 DisclosureTag 로 고지한다. 즉 이 링크를 누르기 전에
 * 고지를 이미 본 상태다 - 그래서 중간 페이지 없이 바로 넘겨도 된다.
 *
 * 집계 실패는 무시한다. 통계 때문에 구매 동선을 막지 않는다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params;

  // "1.5" → 15, "-3" → 3 처럼 엉뚱한 번호가 되지 않게 순수 정수 표기만 받는다.
  const raw = String(number).trim();
  if (!/^\d{1,5}$/.test(raw)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }
  const displayNumber = Number.parseInt(raw, 10);
  if (displayNumber <= 0) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const tracking = parseTrackingParams(request.nextUrl.searchParams);

  let item: VideoItemWithProduct | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from("video_items")
      .select("*, products(*)")
      .eq("display_number", displayNumber)
      .maybeSingle();
    item = (data as VideoItemWithProduct | null) ?? null;
  } catch (e) {
    console.warn(`상품 조회 실패: ${(e as Error).message.slice(0, 200)}`);
  }

  const target = item?.products ? productTargetUrl(item.products) : null;

  // 번호를 못 찾거나 링크가 없으면 N번 페이지로 안내한다(막다른 404 대신).
  // 그 페이지가 "아직 정리되지 않은 번호"라고 설명해 준다.
  if (!item || !target) {
    return NextResponse.redirect(new URL(`/n/${displayNumber}`, request.url), 302);
  }

  // 크롤러·미리보기·프리페치는 이동만 시켜 주고 집계에서 뺀다.
  // (걸러도 리다이렉트는 그대로 - 자세한 이유는 lib/requestFilter.ts 머리말)
  const skipReason = outboundSkipReason(request, displayNumber);
  if (skipReason) {
    await recordBlockedOutbound(skipReason);
  } else {
    await recordProductEvent({
      displayNumber,
      eventType: "outbound_click",
      tracking,
    });
  }

  // subId 로 영상 번호를 심어 커미션 리포트에서 영상별 수익을 되짚는다.
  // 알리는 subId 개념이 없고 제휴 링크에 쿼리를 덧붙이면 링크가 깨질 수 있어
  // 쿠팡일 때만 붙인다 (/api/click 과 같은 규칙).
  const finalUrl =
    item.products.source === "aliexpress"
      ? target
      : withSubId(target, `v${displayNumber}`);

  return NextResponse.redirect(finalUrl, 302);
}

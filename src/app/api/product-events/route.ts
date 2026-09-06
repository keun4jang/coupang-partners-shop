import { NextRequest, NextResponse } from "next/server";
import { parseTrackingParams, recordProductEvent } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * 랜딩 방문 집계용 엔드포인트.
 *   POST /api/product-events
 *   { "displayNumber": 65, "src": "youtube_shorts", "channel": "youtube", "tpl": "usecase" }
 *
 * N번 페이지에서 fire-and-forget 으로 부른다(응답을 기다리지 않는다).
 * 실패해도 화면에는 아무 영향이 없어야 하므로 항상 200 을 돌려준다 -
 * 브라우저 콘솔에 빨간 오류가 찍히는 것만으로도 사장님이 불안해질 이유가 없다.
 *
 * outbound_click 은 여기서 받지 않는다. 그건 /go/[number] 가 실제 이동과
 * 함께 기록해야 "눌렀지만 이동 못 함" 같은 허수가 안 생긴다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const displayNumber = Number(body.displayNumber);
    if (!Number.isFinite(displayNumber) || displayNumber <= 0) {
      return NextResponse.json({ ok: false, reason: "bad_number" });
    }

    // 본문 값도 쿼리스트링과 같은 화이트리스트를 통과시킨다.
    const params = new URLSearchParams();
    for (const key of ["src", "channel", "vid", "tpl", "rank"] as const) {
      const value = body[key];
      if (typeof value === "string" || typeof value === "number") {
        params.set(key, String(value));
      }
    }

    await recordProductEvent({
      displayNumber,
      eventType: "landing_view",
      tracking: parseTrackingParams(params),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn(`방문 집계 실패(무시): ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ ok: false });
  }
}

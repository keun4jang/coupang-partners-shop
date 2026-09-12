import { NextRequest, NextResponse } from "next/server";
import { isHubPlatform, recordProfileHubView } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * 프로필 허브 방문 집계용 엔드포인트.
 *   POST /api/hub-events
 *   { "platform": "instagram" }
 *
 * /from/[platform] 페이지에서 fire-and-forget 으로 부른다.
 * product-events 와 같은 원칙: 실패해도 화면에 영향 없이 항상 200.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const platform = String(body.platform ?? "");
    if (!isHubPlatform(platform)) {
      return NextResponse.json({ ok: false, reason: "bad_platform" });
    }

    await recordProfileHubView(platform);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn(`허브 방문 집계 실패(무시): ${(e as Error).message.slice(0, 200)}`);
    return NextResponse.json({ ok: false });
  }
}

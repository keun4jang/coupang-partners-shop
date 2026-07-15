import { NextRequest, NextResponse } from "next/server";

/**
 * 알리익스프레스 OAuth 콜백 - 인증 후 code 를 화면에 그대로 보여준다.
 * (사용자가 이 code 를 복사해 토큰 교환에 쓴다. 자동 저장은 하지 않음 - 1회성 수동 발급)
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return new NextResponse("code 파라미터가 없습니다.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(
    `알리 인증 코드입니다. 아래 값을 복사해서 붙여넣어 주세요:\n\n${code}\n`,
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}

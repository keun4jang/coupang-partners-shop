/**
 * 쿠팡으로 보내는 입구(/go/[번호], /api/click) 공통 안전장치 (2026-10-03).
 *
 *  - 자기 클릭 방지: 관리자로 로그인한 브라우저(사장님 기기)는 쿠팡 대신 /n/{번호}
 *    상품 소개 페이지로 보낸다. 쿠팡은 본인 클릭을 금지하고, 위반 1회로 수익이
 *    몰수될 수 있다. 집계에도 넣지 않는다.
 *  - 점검: ?dry=1 이면 이동하지 않고 목적지만 JSON 으로 보여 준다(집계 안 함).
 *    Claude 가 배포 뒤 "목적지가 정상인지"를 쿠팡을 건드리지 않고 확인하는 용도.
 *  - HEAD 요청(링크 미리보기·검사기)은 이동 없이 응답만 한다.
 *  - 검색엔진 색인 제외(X-Robots-Tag). robots.txt 에서도 /go/ 를 막는다.
 *
 * 봇에게만 다른 목적지를 보여주지는 않는다 - 구글이 위장 링크로 판정할 수 있다.
 * 봇은 지금처럼 쿠팡으로 보내고 집계에서만 뺀다(lib/requestFilter.ts).
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "./adminAuth";

export const NOINDEX = "noindex, nofollow";

export function withNoindex<T extends Response>(res: T): T {
  res.headers.set("X-Robots-Tag", NOINDEX);
  return res;
}

export function headResponse(): Response {
  return withNoindex(new Response(null, { status: 204 }));
}

export function dryRunResponse(displayNumber: number, destination: string, via: string): NextResponse {
  return withNoindex(
    NextResponse.json({ dry: true, number: displayNumber, via, destination })
  );
}

/** 관리자 브라우저면 true. 쿠키 읽기에 실패하면 false(일반 방문자 취급). */
export async function isOwnerBrowser(): Promise<boolean> {
  try {
    return await isAdminAuthenticated();
  } catch {
    return false;
  }
}

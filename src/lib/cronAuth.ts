import { optionalEnv } from "./env";

/**
 * Cron 라우트 인증.
 * Vercel Cron 은 CRON_SECRET 환경변수가 있으면 `Authorization: Bearer <CRON_SECRET>`
 * 헤더를 자동으로 붙여 호출한다. CRON_SECRET 이 없으면(=인증 불가) 항상 거부한다.
 *
 * 예전엔 수동 테스트용으로 ?key= 쿼리도 허용했는데, 쿼리스트링은 액세스 로그와
 * 브라우저 히스토리에 평문으로 남아 시크릿이 새는 통로라 헤더만 받는다.
 * (수동 테스트: curl -H "Authorization: Bearer $CRON_SECRET" <url>)
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

import { optionalEnv } from "./env";

/**
 * Cron 라우트 인증.
 * Vercel Cron 은 CRON_SECRET 환경변수가 있으면 `Authorization: Bearer <CRON_SECRET>`
 * 헤더를 자동으로 붙여 호출한다. 수동 테스트를 위해 ?key= 쿼리도 허용한다.
 * CRON_SECRET 이 없으면(=인증 불가) 항상 거부한다.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  try {
    if (new URL(request.url).searchParams.get("key") === secret) return true;
  } catch {
    // URL 파싱 실패는 무시
  }
  return false;
}

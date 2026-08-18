import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import { optionalEnv } from "./env";

const COOKIE_NAME = "salimtem_admin";

function secretHash(): string | null {
  const secret = optionalEnv("ADMIN_SECRET");
  if (!secret) return null;
  return createHash("sha256").update(secret).digest("hex");
}

export function adminCookieName(): string {
  return COOKIE_NAME;
}

export function adminCookieValue(): string | null {
  return secretHash();
}

/** 입력한 비밀번호가 ADMIN_SECRET 과 일치하는지 (타이밍 안전 비교) */
export function verifyAdminSecret(input: string): boolean {
  const secret = optionalEnv("ADMIN_SECRET");
  if (!secret || !input) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** 서버 컴포넌트/라우트에서 관리자 로그인 여부 확인 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const expected = secretHash();
  if (!expected) return false;
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  // 양쪽을 다시 해시해 항상 같은 길이로 비교한다. 문자열 length 는 같아도
  // 멀티바이트면 Buffer 길이가 달라 timingSafeEqual 이 throw 하는데,
  // 임의 쿠키 하나로 관리자 페이지 전체를 500으로 만들 수 있는 구멍이었다.
  const a = createHash("sha256").update(value).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

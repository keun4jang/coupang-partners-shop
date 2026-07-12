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
  if (!value || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

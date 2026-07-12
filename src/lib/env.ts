/** 환경변수 헬퍼. 필수 값이 없으면 명확한 에러를 던진다. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.example 을 참고하세요.`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function siteUrl(): string {
  return (
    optionalEnv("NEXT_PUBLIC_SITE_URL")?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

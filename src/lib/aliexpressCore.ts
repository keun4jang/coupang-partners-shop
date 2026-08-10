import crypto from "crypto";
import { optionalEnv } from "./env";
import { getSetting, setSetting, getSettings } from "./settings";

/**
 * 알리익스프레스 오픈플랫폼 공통 계층 (서명·게이트웨이 호출·OAuth 토큰).
 *
 * 알리는 용도별로 "앱"이 따로다. 하나의 앱 키로 둘 다 쓸 수 없다
 * (실측 2026-08: DS 앱 키로 aliexpress.affiliate.* 4종 호출 → 전부
 *  InsufficientPermission "App does not have permission to access this api").
 * 그래서 앱을 프로필로 추상화하고, DS(aliexpress.ts)와
 * 어필리에이트(aliexpressAffiliate.ts)가 각자 자기 프로필로 이 계층을 쓴다.
 *
 * 앱마다 access_token 이 별도이므로 app_settings 저장 키도 분리한다.
 */

export const GATEWAY = "https://api-sg.aliexpress.com/sync"; // 비즈니스 API(TOP 스타일)
export const REST_GATEWAY = "https://api-sg.aliexpress.com/rest"; // 시스템툴(토큰 발급)
export const ALI_REDIRECT_URI =
  "https://momitemmom.vercel.app/api/aliexpress/callback";

/** 알리 앱 한 벌(키 환경변수 + 토큰 저장 위치) */
export interface AliApp {
  /** 로그에 찍히는 이름 */
  label: string;
  keyEnv: string;
  secretEnv: string;
  tokenKey: string;
  refreshKey: string;
  refreshedAtKey: string;
}

/** 드롭시핑 앱 - 상품 검색/상세(영상 소싱). 기존 키·토큰 그대로 유지 */
export const DS_APP: AliApp = {
  label: "DS",
  keyEnv: "ALIEXPRESS_APP_KEY",
  secretEnv: "ALIEXPRESS_APP_SECRET",
  tokenKey: "aliexpress_access_token",
  refreshKey: "aliexpress_refresh_token",
  refreshedAtKey: "aliexpress_token_refreshed_at",
};

/** 어필리에이트 앱 - 제휴 링크 생성/수익 리포트. DS 와 완전히 별개의 앱이다 */
export const AFFILIATE_APP: AliApp = {
  label: "어필리에이트",
  keyEnv: "ALIEXPRESS_AFFILIATE_APP_KEY",
  secretEnv: "ALIEXPRESS_AFFILIATE_APP_SECRET",
  tokenKey: "aliexpress_affiliate_access_token",
  refreshKey: "aliexpress_affiliate_refresh_token",
  refreshedAtKey: "aliexpress_affiliate_token_refreshed_at",
};

export function appKey(app: AliApp): string | undefined {
  return optionalEnv(app.keyEnv);
}
export function appSecret(app: AliApp): string | undefined {
  return optionalEnv(app.secretEnv);
}
export function hasAppEnv(app: AliApp): boolean {
  return Boolean(appKey(app) && appSecret(app));
}
function requireApp(app: AliApp): { key: string; secret: string } {
  const key = appKey(app);
  const secret = appSecret(app);
  if (!key || !secret) {
    throw new Error(`알리 ${app.label} 앱 키가 없습니다 (${app.keyEnv}/${app.secretEnv})`);
  }
  return { key, secret };
}

/**
 * app_settings 에 저장된 앱 키가 있으면 process.env 를 채운다.
 * (GitHub Actions WORKER_ENV 시크릿은 API 로 갱신할 수 없어 DB 를 폴백으로 쓴다)
 */
export async function loadAppCredsFromSettings(app: AliApp): Promise<void> {
  if (hasAppEnv(app)) return;
  try {
    const s = await getSettings([app.keyEnv, app.secretEnv]);
    const key = s[app.keyEnv];
    const secret = s[app.secretEnv];
    if (key && secret) {
      process.env[app.keyEnv] = key;
      process.env[app.secretEnv] = secret;
      console.log(`알리 ${app.label} 앱 키: app_settings 값 사용`);
    }
  } catch (e) {
    console.warn(
      `알리 ${app.label} 앱 키 설정 조회 실패(env 값 유지):`,
      (e as Error).message
    );
  }
}

/* ── 서명 ─────────────────────────────────────────────────────────── */

/** TOP(/sync) 서명: 정렬된 key+value 연결 → HMAC-SHA256 → 대문자 hex */
export function signTop(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

/** IOP(/rest) 서명: apiPath + 정렬된 key+value → HMAC-SHA256 → 대문자 hex */
export function signRest(
  apiPath: string,
  params: Record<string, string>,
  secret: string
): string {
  const base =
    apiPath +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

/** 공백을 + 가 아닌 %20 으로 인코딩(서명 불일치 방지) */
export function encodeBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** 게이트웨이 호출 - 일시적 DNS/네트워크 오류는 짧게 재시도 */
export async function postAli(
  url: string,
  body: string,
  attempts = 4
): Promise<Record<string, unknown>> {
  let lastText = "";
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    lastText = await res.text();
    if (!lastText.startsWith("DNS resolution")) {
      try {
        return JSON.parse(lastText) as Record<string, unknown>;
      } catch {
        throw new Error(`알리 응답 파싱 실패: ${lastText.slice(0, 120)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(`알리 게이트웨이 재시도 실패: ${lastText.slice(0, 80)}`);
}

/* ── 비즈니스 API (/sync) ─────────────────────────────────────────── */

/**
 * TOP 게이트웨이 호출. error_response 가 오면 예외.
 * InsufficientPermission 은 "앱 종류가 다르다"는 뜻이라 메시지에 힌트를 붙인다.
 */
export async function topCall(
  app: AliApp,
  method: string,
  bizParams: Record<string, string>,
  accessToken: string
): Promise<Record<string, unknown>> {
  const { key, secret } = requireApp(app);
  const params: Record<string, string> = {
    ...bizParams,
    method,
    app_key: key,
    session: accessToken, // TOP 게이트웨이는 session 파라미터로 토큰 전달
    access_token: accessToken,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    v: "2.0",
  };
  params.sign = signTop(params, secret);
  const data = await postAli(GATEWAY, encodeBody(params));
  const err = data.error_response as { code?: unknown; msg?: unknown } | undefined;
  if (err) {
    const hint =
      String(err.code) === "InsufficientPermission"
        ? ` (${app.label} 앱에 ${method} 권한이 없습니다 - 앱 종류를 확인하세요)`
        : "";
    throw new Error(`알리 API 오류: ${err.code} ${err.msg}${hint}`);
  }
  return data;
}

/* ── OAuth 토큰 ───────────────────────────────────────────────────── */

/** 사용자 동의용 인증 URL (앱별로 client_id 가 다르다) */
export function authUrl(app: AliApp): string {
  const { key } = requireApp(app);
  const p = new URLSearchParams({
    response_type: "code",
    force_auth: "true",
    redirect_uri: ALI_REDIRECT_URI,
    client_id: key,
  });
  return `https://api-sg.aliexpress.com/oauth/authorize?${p.toString()}`;
}

async function restSystemCall(
  app: AliApp,
  apiPath: string,
  bizParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const { key, secret } = requireApp(app);
  const params: Record<string, string> = {
    ...bizParams,
    app_key: key,
    sign_method: "sha256",
    timestamp: String(Date.now()),
  };
  params.sign = signRest(apiPath, params, secret);
  const data = await postAli(`${REST_GATEWAY}${apiPath}`, encodeBody(params));
  if (data.code && data.code !== "0") {
    throw new Error(`알리 토큰 API 오류: ${data.code} ${data.message ?? ""}`);
  }
  return data;
}

/** 인증 code → access_token/refresh_token 발급 후 DB 저장 */
export async function exchangeCode(
  app: AliApp,
  code: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const data = await restSystemCall(app, "/auth/token/security/create", { code });
  const accessToken = data.access_token as string | undefined;
  const refreshToken = data.refresh_token as string | undefined;
  const expiresInSeconds = Number(data.expires_in ?? 0);
  if (!accessToken) throw new Error("알리 토큰 발급 실패: access_token 없음");
  await setSetting(app.tokenKey, accessToken);
  if (refreshToken) await setSetting(app.refreshKey, refreshToken);
  await setSetting(app.refreshedAtKey, new Date().toISOString());
  return { accessToken, expiresInSeconds };
}

/** refresh_token 으로 access_token 갱신 */
export async function refreshToken(app: AliApp): Promise<boolean> {
  const stored = await getSetting(app.refreshKey);
  if (!stored) return false;
  try {
    const data = await restSystemCall(app, "/auth/token/security/refresh", {
      refresh_token: stored,
    });
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) return false;
    await setSetting(app.tokenKey, accessToken);
    if (data.refresh_token) await setSetting(app.refreshKey, String(data.refresh_token));
    await setSetting(app.refreshedAtKey, new Date().toISOString());
    return true;
  } catch (e) {
    console.warn(
      `알리 ${app.label} 토큰 갱신 실패:`,
      (e as Error).message.slice(0, 150)
    );
    return false;
  }
}

export async function currentToken(app: AliApp): Promise<string | null> {
  return getSetting(app.tokenKey);
}

/**
 * 필요 시 access_token 자동 갱신 (워커가 매 실행마다 호출 - 멱등/저비용).
 * 마지막 갱신 후 12시간 지났고 토큰이 있을 때만 refresh 를 시도한다.
 */
const REFRESH_EVERY_MS = 12 * 3600_000;
export async function maybeRefresh(app: AliApp): Promise<void> {
  if (!hasAppEnv(app)) return;
  const token = await getSetting(app.tokenKey);
  if (!token) return; // 아직 미인증
  const refreshedAt = await getSetting(app.refreshedAtKey);
  if (refreshedAt && Date.now() - Date.parse(refreshedAt) < REFRESH_EVERY_MS) return;
  await refreshToken(app);
}

import crypto from "crypto";
import { optionalEnv, requireEnv } from "./env";
import { getSetting, setSetting } from "./settings";
import { dhashFromUrl, hammingDistance, MATCH_THRESHOLD } from "./imageHash";

/**
 * 알리익스프레스 드롭시핑(DS) API - "같은 제품" 판매자 데모 영상 자동 소싱.
 *
 * 흐름: 쿠팡 상품명으로 알리 상품 검색(ds.text.search) → 후보 대표 이미지를 우리
 * 상품 사진과 이미지 지문(dHash)으로 대조 → 일치 상품의 상세(ds.product.get)에서
 * 영상 URL 추출. 일치가 없으면 null (호출부가 다음 소스로 폴백).
 *
 * 인증: DS API 는 access_token 이 필요하다(알리 OAuth 셀프 인증).
 *   1) scripts/aliexpress-oauth.mjs url → 출력 URL 로 알리 로그인·동의
 *   2) 콜백 URL(/api/aliexpress/callback)에 표시된 code 복사
 *   3) scripts/aliexpress-oauth.mjs exchange "<code>" → access_token/refresh_token 저장
 *   토큰은 app_settings(DB)에 보관되고, 만료 전 refreshAliToken() 으로 갱신한다.
 *
 * 환경변수: ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET (openservice.aliexpress.com 앱)
 */

const GATEWAY = "https://api-sg.aliexpress.com/sync"; // 비즈니스 API(TOP 스타일)
const REST_GATEWAY = "https://api-sg.aliexpress.com/rest"; // 시스템툴(토큰 발급, path 서명)
export const ALI_REDIRECT_URI =
  "https://momitemmom.vercel.app/api/aliexpress/callback";

const TOKEN_KEY = "aliexpress_access_token";
const REFRESH_KEY = "aliexpress_refresh_token";
const REFRESHED_AT_KEY = "aliexpress_token_refreshed_at";

export function hasAliexpressEnv(): boolean {
  return Boolean(
    optionalEnv("ALIEXPRESS_APP_KEY") && optionalEnv("ALIEXPRESS_APP_SECRET")
  );
}

/**
 * app_settings 에 저장된 알리 앱 키가 있으면 process.env 를 채운다.
 *
 * 왜: GitHub Actions 의 WORKER_ENV 시크릿이 알리 연동 이전의 스냅샷이라
 * ALIEXPRESS_* 가 없고, 그 탓에 운영에서 알리 소싱이 통째로 스킵돼 왔다
 * (소싱은 조용히 폴백하는 설계라 눈에 안 띄었음). 시크릿은 API 로 갱신할 수
 * 없으므로 유튜브 자격증명과 동일하게 DB(app_settings) 값을 로드한다.
 * env 에 이미 있으면(로컬 등) 그대로 둔다.
 */
export async function loadAliexpressCredsFromSettings(): Promise<void> {
  if (hasAliexpressEnv()) return;
  try {
    const { getSettings } = await import("./settings");
    const s = await getSettings(["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET"]);
    if (s.ALIEXPRESS_APP_KEY && s.ALIEXPRESS_APP_SECRET) {
      process.env.ALIEXPRESS_APP_KEY = s.ALIEXPRESS_APP_KEY;
      process.env.ALIEXPRESS_APP_SECRET = s.ALIEXPRESS_APP_SECRET;
      console.log("알리 앱 키: app_settings 값 사용");
    }
  } catch (e) {
    console.warn("알리 앱 키 설정 조회 실패(env 값 유지):", (e as Error).message);
  }
}

/* ── 서명 ─────────────────────────────────────────────────────────── */

/** TOP(/sync) 서명: 정렬된 key+value 연결 → HMAC-SHA256 → 대문자 hex */
function signTop(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

/** IOP(/rest) 서명: apiPath + 정렬된 key+value → HMAC-SHA256 → 대문자 hex */
function signRest(
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
function encodeBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** 게이트웨이 호출 - 일시적 DNS/네트워크 오류는 짧게 재시도 */
async function postAli(
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

/* ── OAuth 토큰 ───────────────────────────────────────────────────── */

/** 사용자 동의용 인증 URL */
export function aliAuthUrl(): string {
  const appKey = requireEnv("ALIEXPRESS_APP_KEY");
  const p = new URLSearchParams({
    response_type: "code",
    force_auth: "true",
    redirect_uri: ALI_REDIRECT_URI,
    client_id: appKey,
  });
  return `https://api-sg.aliexpress.com/oauth/authorize?${p.toString()}`;
}

async function restSystemCall(
  apiPath: string,
  bizParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const appKey = requireEnv("ALIEXPRESS_APP_KEY");
  const appSecret = requireEnv("ALIEXPRESS_APP_SECRET");
  const params: Record<string, string> = {
    ...bizParams,
    app_key: appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
  };
  params.sign = signRest(apiPath, params, appSecret);
  const data = await postAli(`${REST_GATEWAY}${apiPath}`, encodeBody(params));
  if (data.code && data.code !== "0") {
    throw new Error(`알리 토큰 API 오류: ${data.code} ${data.message ?? ""}`);
  }
  return data;
}

/** 인증 code → access_token/refresh_token 발급 후 DB 저장 */
export async function exchangeAliCode(
  code: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const data = await restSystemCall("/auth/token/security/create", { code });
  const accessToken = data.access_token as string | undefined;
  const refreshToken = data.refresh_token as string | undefined;
  const expiresInSeconds = Number(data.expires_in ?? 0);
  if (!accessToken) throw new Error("알리 토큰 발급 실패: access_token 없음");
  await setSetting(TOKEN_KEY, accessToken);
  if (refreshToken) await setSetting(REFRESH_KEY, refreshToken);
  await setSetting(REFRESHED_AT_KEY, new Date().toISOString());
  return { accessToken, expiresInSeconds };
}

/** refresh_token 으로 access_token 갱신 */
export async function refreshAliToken(): Promise<boolean> {
  const refreshToken = await getSetting(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const data = await restSystemCall("/auth/token/security/refresh", {
      refresh_token: refreshToken,
    });
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) return false;
    await setSetting(TOKEN_KEY, accessToken);
    if (data.refresh_token) await setSetting(REFRESH_KEY, String(data.refresh_token));
    await setSetting(REFRESHED_AT_KEY, new Date().toISOString());
    return true;
  } catch (e) {
    console.warn(`알리 토큰 갱신 실패: ${(e as Error).message.slice(0, 150)}`);
    return false;
  }
}

async function currentAliToken(): Promise<string | null> {
  return getSetting(TOKEN_KEY);
}

/**
 * 필요 시 access_token 자동 갱신 (워커가 매 실행마다 호출 - 멱등/저비용).
 * 마지막 갱신 후 12시간 지났고 토큰이 있을 때만 refresh 를 시도한다.
 * (프로덕션 앱이면 장기 토큰이라 이걸로 무기한 유지, Test 앱이면 만료 전까지만)
 */
export async function maybeRefreshAliToken(): Promise<void> {
  if (!hasAliexpressEnv()) return;
  const token = await getSetting(TOKEN_KEY);
  if (!token) return; // 아직 미인증
  const refreshedAt = await getSetting(REFRESHED_AT_KEY);
  const REFRESH_EVERY_MS = 12 * 3600_000;
  if (refreshedAt && Date.now() - Date.parse(refreshedAt) < REFRESH_EVERY_MS) return;
  await refreshAliToken();
}

/* ── 비즈니스 API (/sync) ─────────────────────────────────────────── */

async function dsCall(
  method: string,
  bizParams: Record<string, string>,
  accessToken: string
): Promise<Record<string, unknown>> {
  const appKey = requireEnv("ALIEXPRESS_APP_KEY");
  const appSecret = requireEnv("ALIEXPRESS_APP_SECRET");
  const params: Record<string, string> = {
    ...bizParams,
    method,
    app_key: appKey,
    session: accessToken, // TOP 게이트웨이는 session 파라미터로 토큰 전달
    access_token: accessToken,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    v: "2.0",
  };
  params.sign = signTop(params, appSecret);
  const data = await postAli(GATEWAY, encodeBody(params));
  const err = data.error_response as { code?: unknown; msg?: unknown } | undefined;
  if (err) throw new Error(`알리 API 오류: ${err.code} ${err.msg}`);
  return data;
}

/** JSON 아무 곳에서나 product_id + 이미지 URL 을 갖는 객체들을 긁어온다(응답 구조 변화에 강함) */
function harvestProducts(obj: unknown, out: AliProduct[], seen: Set<string>): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) harvestProducts(el, out, seen);
    return;
  }
  const rec = obj as Record<string, unknown>;
  const pid =
    rec["product_id"] ??
    rec["productId"] ??
    rec["item_id"] ??
    rec["itemId"];
  const img =
    rec["product_main_image_url"] ??
    rec["image_url"] ??
    rec["imageUrl"] ??
    rec["main_image_url"] ??
    rec["product_image_url"] ??
    rec["itemMainPic"] ??
    rec["itemPic"] ??
    rec["imagePath"];
  if (pid && img && typeof img === "string" && /^https?:/.test(img)) {
    const id = String(pid);
    if (!seen.has(id)) {
      seen.add(id);
      out.push({
        productId: id,
        title: String(
          rec["product_title"] ?? rec["title"] ?? rec["subject"] ?? ""
        ),
        imageUrl: img,
      });
    }
  }
  for (const v of Object.values(rec)) harvestProducts(v, out, seen);
}

/** JSON 어디서든 mp4/video URL 을 찾아 첫 후보를 돌려준다 */
function harvestVideoUrl(obj: unknown): string | null {
  const found: string[] = [];
  const walk = (o: unknown) => {
    if (!o) return;
    if (typeof o === "string") {
      if (/^https?:\/\/[^\s"']+\.mp4/i.test(o)) found.push(o);
      return;
    }
    if (typeof o === "object") {
      for (const v of Object.values(o as Record<string, unknown>)) walk(v);
    }
  };
  walk(obj);
  return found[0] ?? null;
}

export interface AliProduct {
  productId: string;
  title: string;
  imageUrl: string;
}

/** 상품명 → 검색 키워드 (옵션/수량/괄호 제거, 앞쪽 핵심 토큰) */
export function keywordsFromProductName(name: string): string {
  const cleaned = name
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/,.*$/, " ")
    .replace(/\d+(\.\d+)?\s*(개입|개|매|장|ml|l|리터|kg|g|cm|mm|인치|단|팩|세트|p|P)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  return tokens.slice(0, 4).join(" ") || cleaned || name;
}

/** 키워드로 상품 검색 (이미지·id) */
export async function searchAliProducts(
  keywords: string,
  accessToken: string
): Promise<AliProduct[]> {
  const data = await dsCall(
    "aliexpress.ds.text.search",
    {
      keyWord: keywords,
      local: "ko_KR",
      countryCode: "KR",
      currency: "KRW",
      pageSize: "20",
      pageIndex: "1",
      sortBy: "orders,desc",
    },
    accessToken
  );
  const out: AliProduct[] = [];
  harvestProducts(data, out, new Set());
  return out;
}

/** 상품 상세에서 영상 URL 추출 */
export async function getAliProductVideo(
  productId: string,
  accessToken: string
): Promise<string | null> {
  const data = await dsCall(
    "aliexpress.ds.product.get",
    {
      product_id: productId,
      ship_to_country: "KR",
      target_currency: "KRW",
      target_language: "KO",
    },
    accessToken
  );
  return harvestVideoUrl(data);
}

export interface AliVideoMatch {
  videoUrl: string;
  matchedTitle: string;
  distance: number;
}

/**
 * 쿠팡 상품과 "같은 제품"인 알리 상품의 데모 영상을 찾는다.
 * 이미지 지문이 임계치 이하로 일치하는 상품의 상세영상만 돌려준다(오매칭 차단).
 */
export async function findMatchingAliVideo(
  productName: string,
  productImageUrl: string
): Promise<AliVideoMatch | null> {
  if (!hasAliexpressEnv()) return null;
  const token = await currentAliToken();
  if (!token) {
    console.warn("알리 매칭: access_token 없음(인증 필요) - 스킵");
    return null;
  }

  const ourHash = await dhashFromUrl(productImageUrl);
  if (ourHash === null) return null;

  const keywords = keywordsFromProductName(productName);
  let candidates: AliProduct[];
  try {
    candidates = await searchAliProducts(keywords, token);
  } catch (e) {
    const msg = (e as Error).message;
    // 토큰 만료면 1회 갱신 후 재시도
    if (/token|auth|session/i.test(msg) && (await refreshAliToken())) {
      const t2 = await currentAliToken();
      candidates = t2 ? await searchAliProducts(keywords, t2) : [];
    } else {
      console.warn(`알리 검색 실패("${keywords}"): ${msg.slice(0, 150)}`);
      return null;
    }
  }
  console.log(`알리 검색 "${keywords}": 후보 ${candidates.length}개`);

  // 이미지가 일치하는 상품을 거리순으로 정렬해 상위부터 영상 확인
  const scored: Array<{ p: AliProduct; distance: number }> = [];
  for (const p of candidates.slice(0, 15)) {
    const h = await dhashFromUrl(p.imageUrl);
    if (h === null) continue;
    const distance = hammingDistance(ourHash, h);
    if (distance <= MATCH_THRESHOLD) scored.push({ p, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);

  const token2 = (await currentAliToken()) ?? token;
  for (const { p, distance } of scored) {
    const videoUrl = await getAliProductVideo(p.productId, token2);
    if (videoUrl) {
      console.log(`알리 매칭 성공 (거리 ${distance}): ${p.title.slice(0, 50)}`);
      return { videoUrl, matchedTitle: p.title, distance };
    }
  }
  console.log("알리 매칭: 일치+영상 있는 상품 없음 → 폴백");
  return null;
}

/**
 * 알리익스프레스 OAuth - access_token 발급 도구.
 *
 * 알리는 용도별로 앱이 따로다(DS = 영상 소싱, affiliate = 제휴 링크·수익).
 * 앱마다 키도 토큰도 별개라, 세 번째 인자로 어느 앱인지 지정한다.
 *
 * 사용:
 *   node scripts/aliexpress-oauth.mjs url [ds|affiliate]
 *     → 출력 URL 을 브라우저에서 열고 알리 계정으로 로그인·동의.
 *       콜백 페이지(momitemmom.vercel.app/api/aliexpress/callback)에 code 가 표시됨.
 *   node scripts/aliexpress-oauth.mjs exchange "<code>" [ds|affiliate]
 *     → access_token/refresh_token 을 Supabase app_settings 에 저장.
 *
 * 앱을 생략하면 ds (기존 동작 유지).
 *
 * 필요: .env.local 의 해당 앱 키 + SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   ds        → ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET
 *   affiliate → ALIEXPRESS_AFFILIATE_APP_KEY / ALIEXPRESS_AFFILIATE_APP_SECRET
 */
import crypto from "node:crypto";
import fs from "node:fs";

function parseEnv(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = { ...parseEnv(".env.local"), ...parseEnv(".env"), ...process.env };

const APPS = {
  ds: {
    label: "DS(영상 소싱)",
    keyEnv: "ALIEXPRESS_APP_KEY",
    secretEnv: "ALIEXPRESS_APP_SECRET",
    tokenKey: "aliexpress_access_token",
    refreshKey: "aliexpress_refresh_token",
    refreshedAtKey: "aliexpress_token_refreshed_at",
  },
  affiliate: {
    label: "어필리에이트(제휴 링크)",
    keyEnv: "ALIEXPRESS_AFFILIATE_APP_KEY",
    secretEnv: "ALIEXPRESS_AFFILIATE_APP_SECRET",
    tokenKey: "aliexpress_affiliate_access_token",
    refreshKey: "aliexpress_affiliate_refresh_token",
    refreshedAtKey: "aliexpress_affiliate_token_refreshed_at",
  },
};

/** 인자 중 ds/affiliate 를 찾는다 (위치 무관, 없으면 ds) */
const appName = process.argv.slice(2).find((a) => a === "ds" || a === "affiliate") ?? "ds";
const APP = APPS[appName];
const APP_KEY = env[APP.keyEnv];
const APP_SECRET = env[APP.secretEnv];
const REDIRECT = "https://momitemmom.vercel.app/api/aliexpress/callback";
const REST = "https://api-sg.aliexpress.com/rest";

if (!APP_KEY || !APP_SECRET) {
  console.error(`${APP.keyEnv} / ${APP.secretEnv} 가 필요합니다 (.env.local). [앱: ${APP.label}]`);
  process.exit(1);
}
console.log(`대상 앱: ${APP.label}`);

function signRest(apiPath, params) {
  const base =
    apiPath + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha256", APP_SECRET).update(base).digest("hex").toUpperCase();
}
function encodeBody(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function saveSetting(key, value) {
  const url = env.SUPABASE_URL;
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) {
    console.warn(`(경고) Supabase 미설정 - ${key} 저장 건너뜀. 값: ${value}`);
    return;
  }
  await fetch(`${url}/rest/v1/app_settings`, {
    method: "POST",
    headers: {
      apikey: svc,
      Authorization: `Bearer ${svc}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ key, value }]),
  });
}

const cmd = process.argv[2];

if (cmd === "url") {
  const p = new URLSearchParams({
    response_type: "code",
    force_auth: "true",
    redirect_uri: REDIRECT,
    client_id: APP_KEY,
  });
  console.log("\n아래 URL 을 브라우저에서 열어 알리 계정으로 동의하세요:\n");
  console.log(`https://api-sg.aliexpress.com/oauth/authorize?${p.toString()}`);
  console.log(
    "\n동의 후 콜백 페이지에 표시된 code 값을 복사해서:\n" +
      `  node scripts/aliexpress-oauth.mjs exchange "<code>" ${appName}\n`
  );
} else if (cmd === "exchange") {
  const code = process.argv.slice(3).find((a) => a !== "ds" && a !== "affiliate");
  if (!code) {
    console.error('code 를 전달하세요: node scripts/aliexpress-oauth.mjs exchange "<code>" [ds|affiliate]');
    process.exit(1);
  }
  const apiPath = "/auth/token/security/create";
  const params = {
    code,
    app_key: APP_KEY,
    sign_method: "sha256",
    timestamp: String(Date.now()),
  };
  params.sign = signRest(apiPath, params);
  const res = await fetch(`${REST}${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeBody(params),
  });
  const json = await res.json();
  if (!json.access_token) {
    console.error("토큰 발급 실패:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  await saveSetting(APP.tokenKey, json.access_token);
  if (json.refresh_token) await saveSetting(APP.refreshKey, json.refresh_token);
  await saveSetting(APP.refreshedAtKey, new Date().toISOString());
  console.log("\n✅ 발급·저장 완료!");
  console.log(`   access_token 만료: ${Math.round((json.expires_in ?? 0) / 86400)}일 후`);
  console.log(`   refresh_token 만료: ${Math.round((json.refresh_expires_in ?? 0) / 86400)}일 후`);
} else {
  console.log(
    "사용법:\n" +
      "  node scripts/aliexpress-oauth.mjs url [ds|affiliate]\n" +
      '  node scripts/aliexpress-oauth.mjs exchange "<code>" [ds|affiliate]\n' +
      "  (앱 생략 시 ds)"
  );
}

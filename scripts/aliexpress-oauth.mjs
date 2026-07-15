/**
 * 알리익스프레스 DS API OAuth - access_token 발급 도구.
 *
 * 사용:
 *   1) node scripts/aliexpress-oauth.mjs url
 *      → 출력 URL 을 브라우저에서 열고 알리 계정으로 로그인·동의.
 *        콜백 페이지(momitemmom.vercel.app/api/aliexpress/callback)에 code 가 표시됨.
 *   2) node scripts/aliexpress-oauth.mjs exchange "<code>"
 *      → access_token/refresh_token 을 Supabase app_settings 에 저장.
 *
 * 필요: .env.local 의 ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET,
 *       SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
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

const APP_KEY = env.ALIEXPRESS_APP_KEY;
const APP_SECRET = env.ALIEXPRESS_APP_SECRET;
const REDIRECT = "https://momitemmom.vercel.app/api/aliexpress/callback";
const REST = "https://api-sg.aliexpress.com/rest";

if (!APP_KEY || !APP_SECRET) {
  console.error("ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET 가 필요합니다 (.env.local).");
  process.exit(1);
}

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
      '  node scripts/aliexpress-oauth.mjs exchange "<code>"\n'
  );
} else if (cmd === "exchange") {
  const code = process.argv[3];
  if (!code) {
    console.error('code 를 전달하세요: node scripts/aliexpress-oauth.mjs exchange "<code>"');
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
  await saveSetting("aliexpress_access_token", json.access_token);
  if (json.refresh_token) await saveSetting("aliexpress_refresh_token", json.refresh_token);
  await saveSetting("aliexpress_token_refreshed_at", new Date().toISOString());
  console.log("\n✅ 발급·저장 완료!");
  console.log(`   access_token 만료: ${Math.round((json.expires_in ?? 0) / 86400)}일 후`);
  console.log(`   refresh_token 만료: ${Math.round((json.refresh_expires_in ?? 0) / 86400)}일 후`);
} else {
  console.log(
    "사용법:\n  node scripts/aliexpress-oauth.mjs url\n  node scripts/aliexpress-oauth.mjs exchange \"<code>\""
  );
}

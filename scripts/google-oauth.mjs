/**
 * 구글 드라이브 OAuth 사용자 위임 - refresh token 발급 도구.
 * 일반 Gmail(예: trussvideo1@gmail.com)에서 서비스계정 대신 "내 계정으로" 업로드하기 위함.
 *
 * 준비: Google Cloud Console 에서 OAuth 2.0 클라이언트 ID(데스크톱 앱) 생성 →
 *       GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 를 .env.local 에 넣거나 환경변수로 전달.
 *
 * 사용:
 *   1) 동의 URL 발급:
 *        node scripts/google-oauth.mjs url
 *      → 출력된 URL 을 브라우저에서 열고, 드라이브 소유 계정으로 로그인·동의.
 *        (redirect 가 http://localhost 라 브라우저는 "연결 실패"가 뜨지만
 *         주소창 URL 에 ?code=... 가 들어있음 - 그 code 값을 복사)
 *
 *   2) code 로 refresh token 교환:
 *        node scripts/google-oauth.mjs exchange "<붙여넣은 code 또는 전체 redirect URL>"
 *      → 출력된 GOOGLE_OAUTH_REFRESH_TOKEN 값을 .env.local 에 추가.
 */
import fs from "node:fs";

// 기존에 만들어둔 폴더(내 드라이브)에 업로드하려면 전체 drive 스코프 필요.
const SCOPE = "https://www.googleapis.com/auth/drive";
const REDIRECT = "http://localhost";

function parseEnv(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnv(".env.local"), ...parseEnv(".env"), ...process.env };
const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 가 필요합니다 (.env.local 또는 환경변수)."
  );
  process.exit(1);
}

const cmd = process.argv[2];

if (cmd === "url") {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  console.log("\n아래 URL 을 브라우저에서 열어 드라이브 소유 계정으로 동의하세요:\n");
  console.log("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  console.log(
    '\n동의 후 "localhost 연결 실패" 페이지가 뜨면, 주소창의 code=... 값을 복사해서:\n' +
      '  node scripts/google-oauth.mjs exchange "<code 또는 전체 URL>"\n'
  );
} else if (cmd === "exchange") {
  const raw = process.argv[3] || "";
  if (!raw) {
    console.error('code 를 전달하세요: node scripts/google-oauth.mjs exchange "<code>"');
    process.exit(1);
  }
  // 전체 redirect URL 을 넣어도 code 만 추출
  let code = raw;
  const m = raw.match(/[?&]code=([^&]+)/);
  if (m) code = decodeURIComponent(m[1]);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!json.refresh_token) {
    console.error("refresh token 발급 실패:", JSON.stringify(json, null, 2));
    console.error(
      "\n힌트: code 는 1회용/단시간 유효입니다. url 재발급 후 즉시 교환하세요.\n" +
        "동의 화면에서 access_type=offline+prompt=consent 라 refresh_token 이 나와야 정상입니다."
    );
    process.exit(1);
  }
  console.log("\n발급 성공! 아래 값을 .env.local 에 추가하세요:\n");
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${json.refresh_token}`);
  console.log("");
} else {
  console.log(
    "사용법:\n  node scripts/google-oauth.mjs url\n  node scripts/google-oauth.mjs exchange \"<code>\""
  );
}

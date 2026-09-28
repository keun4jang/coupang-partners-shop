/**
 * 유튜브 토큰 재발급 - 분석(시청 지속률) 권한 추가용.
 *
 * 왜 필요한가 (2026-09-28): 첫 1~2초 이탈률("계속 시청함 %")이 지금 가장 중요한
 * 지표인데(채널 12.6%, 포맷 D 22% / E 8%), 저장된 토큰에 yt-analytics.readonly
 * 권한이 없어 API 로 못 읽고 매주 사람이 스튜디오에서 옮겨 적어야 했다.
 *
 * 흐름 (youtube-reauth 워크플로):
 *   1) step=url      → 동의 링크를 찍는다(client_id 만 들어 있다, 비밀 아님)
 *   2) 사장님이 채널 계정으로 동의 → "localhost 연결 실패" 페이지 주소창의 code 복사
 *   3) step=exchange, code=<복사한 값> → 토큰 교환 → 권한 검사 → app_settings 저장
 *
 * 안전장치:
 *  - 새 토큰에 force-ssl(자막 억제·설명란 수정에 필요)과 분석 권한이 모두 있어야만
 *    저장한다. 하나라도 빠지면 기존 토큰을 그대로 두고 실패로 끝낸다. 권한이
 *    모자란 토큰으로 덮어쓰면 발행 파이프라인의 자막·설명란 기능이 깨진다.
 *  - 토큰 값은 로그에 절대 찍지 않는다.
 *  - 리프레시 토큰은 발급한 클라이언트에 묶이므로, 워커가 쓰는 것과 같은
 *    YOUTUBE_OAUTH_CLIENT_ID/SECRET 으로 발급한다(드라이브 클라이언트 아님).
 *  - code 는 1회용이고 몇 분 안에 만료되며 client secret 없이는 못 쓴다. 그래도
 *    워크플로 입력은 실행 페이지에 보이므로, 교환 직후 쓸모가 없어지는 값만 받는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { getSettings, setSetting } from "../src/lib/settings";

const REDIRECT = "http://localhost";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const MUST_HAVE = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

async function clientCreds(): Promise<{ id: string; secret: string }> {
  const s = await getSettings(["YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET"]);
  const id = s.YOUTUBE_OAUTH_CLIENT_ID ?? process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "";
  const secret = s.YOUTUBE_OAUTH_CLIENT_SECRET ?? process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "";
  if (!id || !secret) {
    throw new Error("YOUTUBE_OAUTH_CLIENT_ID / SECRET 을 app_settings·환경변수 어디에서도 찾지 못했습니다.");
  }
  return { id, secret };
}

async function printUrl(): Promise<void> {
  const { id } = await clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  console.log("아래 링크를 유튜브 채널 소유 구글 계정으로 열어 동의하세요:\n");
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}\n`);
  console.log('동의 후 "사이트에 연결할 수 없음(localhost)" 페이지가 뜨면 정상입니다.');
  console.log("그 페이지 주소창의 전체 주소(code=... 포함)를 복사해 step=exchange 로 다시 실행하세요.");
  console.log("code 는 몇 분 안에 만료되니 바로 이어서 실행해야 합니다.");
}

async function exchange(raw: string): Promise<void> {
  const m = raw.match(/[?&]code=([^&\s]+)/);
  const code = m ? decodeURIComponent(m[1]) : raw.trim();
  if (!code) throw new Error("code 가 비어 있습니다.");

  const { id, secret } = await clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.refresh_token || !json.access_token) {
    throw new Error(
      `토큰 교환 실패: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim() +
        " (code 는 1회용·단시간 유효 - step=url 부터 다시 하세요)"
    );
  }

  const granted = new Set((json.scope ?? "").split(/\s+/).filter(Boolean));
  console.log("받은 권한:");
  for (const s of granted) console.log(`  · ${s.replace("https://www.googleapis.com/auth/", "")}`);
  const missing = MUST_HAVE.filter((s) => !granted.has(s));
  if (missing.length > 0) {
    throw new Error(
      `필수 권한이 빠져 저장하지 않았습니다(기존 토큰 유지): ${missing
        .map((s) => s.replace("https://www.googleapis.com/auth/", ""))
        .join(", ")}. 동의 화면에서 모든 항목에 체크했는지 확인하세요.`
    );
  }

  // 저장 전에 실제로 분석 API 가 열리는지 확인한다(채널 계정이 맞는지도 여기서 걸러진다).
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const probe = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=views,averageViewPercentage`,
    { headers: { Authorization: `Bearer ${json.access_token}` } }
  );
  if (!probe.ok) {
    throw new Error(`분석 API 확인 실패(${probe.status}) - 저장하지 않았습니다. 채널 소유 계정으로 동의했는지 확인하세요.`);
  }
  const report = (await probe.json()) as { rows?: number[][] };
  const row = report.rows?.[0];
  console.log(`분석 API 확인: 최근 28일 조회 ${row?.[0] ?? "?"} · 평균 조회율 ${row?.[1] ?? "?"}%`);

  const ok = await setSetting("YOUTUBE_OAUTH_REFRESH_TOKEN", json.refresh_token);
  if (!ok) throw new Error("app_settings 저장 실패");
  console.log("새 토큰을 app_settings.YOUTUBE_OAUTH_REFRESH_TOKEN 에 저장했습니다(값은 출력하지 않음).");
}

async function main(): Promise<void> {
  const step = (process.argv[2] ?? "").trim();
  if (step === "url") return printUrl();
  if (step === "exchange") return exchange(process.argv[3] ?? "");
  throw new Error('step 은 "url" 또는 "exchange" 여야 합니다.');
}

main().catch((e) => {
  console.error("실패:", (e as Error).message);
  process.exit(1);
});

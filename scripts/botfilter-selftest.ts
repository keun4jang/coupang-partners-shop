/**
 * 봇 필터 자가 점검.
 *
 * 정책 검사기(policy-selftest.ts)와 같은 이유로 둔다. 두 방향 모두 위험하다.
 *  1) 진짜 사람(인스타·페이스북·카카오톡 인앱 브라우저, 안드로이드 기기)을
 *     봇으로 잘못 보면 → 클릭수가 실제보다 적게 잡혀 "개선이 안 먹혔다"고
 *     잘못 판단하게 된다. 특히 흔한 실수인 /bot/i 정규식은 Cubot 기기를 잡는다.
 *  2) 명백한 크롤러를 놓치면 → 애초에 이 필터를 만든 이유(쿠팡 공식 25건 vs
 *     우리 집계 230건)가 그대로 남는다.
 *
 * 실행: npx tsx scripts/botfilter-selftest.ts   (또는 npm run botfilter:check)
 */
import {
  automatedRequestReason,
  outboundSkipReason,
  resetRepeatCache,
} from "../src/lib/requestFilter";

let failures = 0;

function req(ua: string, extra: Record<string, string> = {}, method = "GET") {
  const headers = new Headers(extra);
  if (ua) headers.set("user-agent", ua);
  return { method, headers };
}

function expectHuman(label: string, ua: string, extra?: Record<string, string>): void {
  const reason = automatedRequestReason(req(ua, extra));
  if (reason !== null) {
    failures++;
    console.error(`✗ [가짜 양성] ${label}\n   판정: ${reason}\n   UA: ${ua.slice(0, 120)}`);
  }
}

function expectBlocked(
  label: string,
  ua: string,
  extra?: Record<string, string>,
  method = "GET"
): void {
  if (automatedRequestReason(req(ua, extra, method)) === null) {
    failures++;
    console.error(`✗ [놓침] ${label}\n   UA: ${ua.slice(0, 120)}`);
  }
}

// ── 1. 진짜 사람 - 절대 걸리면 안 되는 UA ──────────────────────
// 우리 유입의 대부분이다(인스타 릴스·유튜브·페이스북 인앱 브라우저).
const HUMAN_UAS: Array<[string, string]> = [
  [
    "인스타 인앱 (안드로이드)",
    "Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 302.0.0.23.113 Android",
  ],
  [
    "페이스북 인앱 (iOS)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 [FBAN/FBIOS;FBAV/466.0.0.35.107]",
  ],
  [
    "카카오톡 인앱",
    "Mozilla/5.0 (Linux; Android 14; SM-A536N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.5.3",
  ],
  [
    "유튜브 인앱 (안드로이드)",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  ],
  [
    "네이버 앱 인앱",
    "Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.9.2)",
  ],
  [
    "Cubot 실제 기기 (bot 정규식 함정)",
    "Mozilla/5.0 (Linux; Android 12; CUBOT NOTE 20 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36",
  ],
  [
    "다음 앱 인앱 (daum/ 함정)",
    "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DaumApps/6.5.1",
  ],
  [
    "핀터레스트 인앱 (pinterest/ 함정)",
    "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Pinterest for Android/12.4",
  ],
  [
    "사파리 (아이폰)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ],
  [
    "데스크톱 크롬",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ],
  [
    "삼성 인터넷",
    "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  ],
];
for (const [label, ua] of HUMAN_UAS) expectHuman(label, ua);

// ── 2. 명백한 자동 요청 - 반드시 걸려야 하는 UA ────────────────
const BOT_UAS: Array<[string, string]> = [
  ["구글 크롤러", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["빙 크롤러", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
  ["네이버 크롤러", "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"],
  ["다음 크롤러", "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html)"],
  ["페이스북 링크 미리보기", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
  ["카카오톡 링크 미리보기", "Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com)"],
  ["텔레그램 미리보기", "TelegramBot (like TwitterBot)"],
  ["슬랙 미리보기", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
  ["디스코드 미리보기", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
  ["핀터레스트 크롤러", "Pinterest/0.2 (+https://www.pinterest.com/bot.html)"],
  ["AhrefsBot", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
  ["ByteSpider", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"],
  ["GPTBot", "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)"],
  ["curl", "curl/8.4.0"],
  ["wget", "Wget/1.21.3"],
  ["python requests", "python-requests/2.31.0"],
  ["headless chrome", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36"],
  ["모니터링", "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"],
  ["이름 없는 봇 (bot/ 일반형)", "Mozilla/5.0 (compatible; SomeRandomBot/1.4; +http://example.com)"],
];
for (const [label, ua] of BOT_UAS) expectBlocked(label, ua);

// ── 3. UA 말고 요청 모양으로 걸러야 하는 것 ─────────────────────
expectBlocked("UA 없음", "");
expectBlocked(
  "HEAD (링크 살아있나 검사)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
  {},
  "HEAD"
);

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
expectBlocked("크롬 프리페치", CHROME, { "sec-purpose": "prefetch;prerender" });
expectBlocked("구형 프리페치 헤더", CHROME, { purpose: "prefetch" });
expectBlocked("사파리 미리보기", CHROME, { "x-purpose": "preview" });
expectBlocked("파이어폭스 프리페치", CHROME, { "x-moz": "prefetch" });
// 평범한 헤더만 붙었을 때 프리페치로 오인하지 않는지
expectHuman("일반 탐색 (Sec-Fetch-Mode)", CHROME, { "sec-fetch-mode": "navigate" });

// ── 4. 짧은 시간 중복 합치기 ────────────────────────────────────
{
  resetRepeatCache();
  const person = req(CHROME, { "x-forwarded-for": "1.2.3.4" });
  const t0 = 1_700_000_000_000;

  const first = outboundSkipReason(person, 65, t0);
  if (first !== null) {
    failures++;
    console.error(`✗ [중복] 첫 클릭이 제외됐다: ${first}`);
  }

  if (outboundSkipReason(person, 65, t0 + 3_000) !== "repeat") {
    failures++;
    console.error("✗ [중복] 3초 뒤 같은 번호 재요청이 합쳐지지 않았다");
  }

  // 같은 사람이라도 다른 번호를 누른 건 다른 클릭이다
  if (outboundSkipReason(person, 66, t0 + 3_000) !== null) {
    failures++;
    console.error("✗ [중복] 다른 번호 클릭까지 합쳐 버렸다");
  }

  // 다른 사람(IP)이 같은 번호를 누른 것도 다른 클릭이다
  const other = req(CHROME, { "x-forwarded-for": "5.6.7.8" });
  if (outboundSkipReason(other, 65, t0 + 3_000) !== null) {
    failures++;
    console.error("✗ [중복] 다른 IP 클릭까지 합쳐 버렸다");
  }

  // 창(60초)이 지나면 다시 센다
  if (outboundSkipReason(person, 65, t0 + 120_000) !== null) {
    failures++;
    console.error("✗ [중복] 2분 뒤 재방문까지 계속 제외하고 있다");
  }
  resetRepeatCache();
}

if (failures > 0) {
  console.error(`\n봇 필터 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("봇 필터 자가 점검 통과 (가짜 양성 0건, 놓침 0건)");

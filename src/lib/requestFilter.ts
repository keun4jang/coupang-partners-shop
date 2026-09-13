/**
 * 자동 요청(사람이 누른 게 아닌 것) 걸러내기.
 *
 * 왜 필요한가 (2026-09-13 실측):
 *   우리 자체 집계는 최근 7일 롱폼 이동 230건인데, 쿠팡파트너스 공식 클릭수는
 *   이번 달 통틀어 25건이었다. 열 배 가까이 벌어진다. 원인은 /go/[번호] 의
 *   구조다 - "GET 이 들어오면 무조건 +1 하고 리다이렉트"라, 유튜브 설명란에
 *   걸린 링크를 훑는 검색 크롤러, 메신저·SNS 의 링크 미리보기, 브라우저
 *   프리페치가 전부 "사람이 누른 클릭"으로 잡힌다. 쿠팡은 자기 쪽에서 이런
 *   요청을 걸러내므로, 우리도 비슷한 기준으로 걸러야 두 숫자를 비교할 수 있다.
 *   (숫자를 비교할 수 없으면 클릭률 개선이 먹혔는지 판단할 근거가 없다.)
 *
 * 설계 원칙:
 *  · 걸러도 리다이렉트는 그대로 해 준다. 집계만 건너뛴다.
 *    사람을 봇으로 잘못 봐도 최악이 "클릭 1건 덜 셈"이 되게 한다.
 *    그 반대(사람의 구매 동선을 막음)는 절대 일어나면 안 된다.
 *  · UA 목록은 "명시적으로 적은 것"만 본다. 흔한 실수인 /bot/i 정규식은
 *    Cubot 같은 실제 안드로이드 기기명에 걸리고, 페이스북·인스타·카카오톡
 *    인앱 브라우저(진짜 사람)까지 잡을 위험이 있다.
 *  · 완벽할 수 없다. 브라우저 UA 를 흉내내는 크롤러는 못 잡는다. 그래서
 *    최종 검증 기준은 언제나 쿠팡파트너스 공식 클릭수다.
 */

/**
 * UA 소문자에 이 조각이 들어 있으면 자동 요청으로 본다.
 *
 * "bot/" 처럼 슬래시를 붙인 항목이 있는 이유: 봇은 거의 다 "SomeBot/1.0"
 * 형태로 버전을 붙이는 반면, Cubot 같은 실제 기기명은 슬래시가 없다.
 */
const BOT_UA_MARKERS: readonly string[] = [
  // ── 링크 미리보기 (설명란 링크를 펼쳐 보는 메신저·SNS) ──
  "facebookexternalhit",
  "facebookcatalog",
  "meta-externalagent",
  "twitterbot",
  "telegrambot",
  "slackbot",
  "slack-imgproxy",
  "discordbot",
  "whatsapp",
  "kakaotalk-scrap",
  "skypeuripreview",
  "linkedinbot",
  "redditbot",
  // 앱 인앱 브라우저("Pinterest for Android")는 사람이므로 슬래시가 붙는
  // 크롤러 UA("Pinterest/0.2 (+...bot.html)")만 잡는다.
  "pinterest/",
  "embedly",
  "vkshare",
  "bitlybot",
  // ── 검색·수집 크롤러 ──
  "googlebot",
  "google-inspectiontool",
  "adsbot-google",
  "mediapartners-google",
  "feedfetcher-google",
  "apis-google",
  "bingbot",
  "bingpreview",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "applebot",
  "naverbot",
  "yeti/", // 네이버 검색 크롤러
  "daum/", // 다음 검색 크롤러
  "daumoa",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "amazonbot",
  "gptbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "ccbot",
  "perplexitybot",
  "chatgpt-user",
  "oai-searchbot",
  // ── 스크립트·자동화 도구 ──
  "curl/",
  "wget/",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "go-http-client",
  "java/",
  "okhttp",
  "node-fetch",
  "axios/",
  "libwww-perl",
  "guzzlehttp",
  "headlesschrome",
  "phantomjs",
  "playwright",
  "puppeteer",
  "selenium",
  // ── 모니터링·링크 검사 ──
  "uptimerobot",
  "pingdom",
  "statuscake",
  "site24x7",
  "newrelicpinger",
  "datadog",
  // ── 일반형 (위 목록에 없는 봇을 넓게 잡는 안전한 조각) ──
  "bot/",
  "spider",
  "crawler",
  "slurp",
  "scrapy",
  "http-client",
  "httpclient",
];

/**
 * 브라우저가 "곧 누를 것 같다"며 미리 받아가는 요청인가.
 * 사람이 실제로 누른 게 아니므로 클릭으로 세면 안 된다.
 */
function prefetchReason(headers: Headers): string | null {
  const secPurpose = (headers.get("sec-purpose") ?? "").toLowerCase();
  if (secPurpose.includes("prefetch") || secPurpose.includes("prerender")) {
    return "prefetch:sec-purpose";
  }
  for (const name of ["purpose", "x-purpose"]) {
    const v = (headers.get(name) ?? "").toLowerCase();
    if (v.includes("prefetch") || v.includes("preview")) return `prefetch:${name}`;
  }
  if ((headers.get("x-moz") ?? "").toLowerCase().includes("prefetch")) {
    return "prefetch:x-moz";
  }
  if (headers.get("next-router-prefetch")) return "prefetch:next-router";
  return null;
}

/** automatedRequestReason / outboundSkipReason 가 필요로 하는 최소한의 요청 모양 */
export interface FilterableRequest {
  method: string;
  headers: Headers;
}

/**
 * 자동 요청이면 사유 문자열, 사람으로 보이면 null.
 * 사유는 집계 테이블에 그대로 들어가므로 짧고 고정된 어휘만 쓴다.
 */
export function automatedRequestReason(request: FilterableRequest): string | null {
  // Next 는 HEAD 요청도 GET 핸들러로 넘긴다. 링크 검사기·스캐너가 "살아있나"만
  // 확인하는 요청이라 본문도 안 받아 간다 - 사람 클릭일 수가 없다.
  const method = (request.method || "GET").toUpperCase();
  if (method !== "GET") return `method:${method.toLowerCase()}`;

  const prefetch = prefetchReason(request.headers);
  if (prefetch) return prefetch;

  // 브라우저는 UA 를 반드시 보낸다. 비어 있으면 직접 짠 스크립트다.
  const ua = (request.headers.get("user-agent") ?? "").trim().toLowerCase();
  if (ua === "") return "ua:empty";

  const marker = BOT_UA_MARKERS.find((m) => ua.includes(m));
  return marker ? `ua:${marker}` : null;
}

/**
 * 짧은 시간 안에 되풀이되는 같은 요청을 1건으로 합치기 위한 최근 기록.
 *
 * 서버리스라 인스턴스마다 따로 갖는 "있으면 좋은" 수준의 방어다(인스턴스가
 * 갈리면 못 잡는다). 그래도 미리보기 요청이 두 번 오거나 사용자가 뒤로가기로
 * 링크를 다시 밟는 흔한 중복은 여기서 걸린다. 메모리는 상한을 둬서 묶어 둔다.
 */
const REPEAT_WINDOW_MS = 60_000;
const REPEAT_MAX_KEYS = 500;
const recentRequests = new Map<string, number>();

/** 테스트·자가점검용. 운영 코드에서는 부르지 않는다. */
export function resetRepeatCache(): void {
  recentRequests.clear();
}

function pruneRepeatCache(now: number): void {
  if (recentRequests.size <= REPEAT_MAX_KEYS) return;
  for (const [key, at] of recentRequests) {
    if (now - at > REPEAT_WINDOW_MS) recentRequests.delete(key);
  }
  // 그래도 넘치면 오래 들어와 있던 것부터 버린다 (Map 은 삽입 순서를 지킨다)
  while (recentRequests.size > REPEAT_MAX_KEYS) {
    const oldest = recentRequests.keys().next();
    if (oldest.done) break;
    recentRequests.delete(oldest.value);
  }
}

/**
 * 같은 키가 REPEAT_WINDOW_MS 안에 또 들어왔으면 true(= 세지 않음).
 * 계속 두드리는 상대에게는 창을 뒤로 밀어, 창 길이마다 1건씩 새는 걸 막는다.
 */
export function isRepeatRequest(key: string, now: number = Date.now()): boolean {
  const prev = recentRequests.get(key);
  recentRequests.set(key, now);
  if (prev !== undefined && now - prev <= REPEAT_WINDOW_MS) return true;
  pruneRepeatCache(now);
  return false;
}

/** 중복 판정 키: 같은 사람(IP+UA)이 같은 번호를 다시 눌렀나 */
function repeatKey(request: FilterableRequest, displayNumber: number): string {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua = request.headers.get("user-agent") ?? "";
  return `${ip}|${ua}|${displayNumber}`;
}

/**
 * /go/[번호] 이동을 집계에서 뺄 사유. 셀 만한 요청이면 null.
 *
 * 봇으로 판정되면 중복 기록조차 남기지 않는다(봇이 캐시 자리를 차지해
 * 진짜 사람의 중복 판정을 밀어내지 않도록).
 */
export function outboundSkipReason(
  request: FilterableRequest,
  displayNumber: number,
  now: number = Date.now()
): string | null {
  const automated = automatedRequestReason(request);
  if (automated) return automated;
  return isRepeatRequest(repeatKey(request, displayNumber), now) ? "repeat" : null;
}

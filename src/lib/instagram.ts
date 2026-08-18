import { optionalEnv, requireEnv } from "./env";
import { getSetting, setSetting } from "./settings";

/**
 * 인스타그램 릴스 자동 게시 (Instagram API with Instagram Login).
 *
 * 이 앱은 "Instagram 로그인이 포함된 API 설정" 방식이라 graph.instagram.com 을 쓴다.
 * (구버전 graph.facebook.com + 페이스북 페이지 연결 + 앱 심사 방식이 아님)
 *
 * 설정 완료 상태(메타 개발자 센터에서 이미 완료):
 *  1) @momitemmom 을 인스타그램 프로페셔널(비즈니스/크리에이터) 계정으로 전환
 *  2) 앱 "역할"에서 @momitemmom 을 Instagram 테스터로 추가 → 초대 수락
 *  3) instagram_business_basic + instagram_business_content_publish 권한 부여
 *  4) 대시보드에서 액세스 토큰 생성(테스터는 앱 심사 없이 바로 사용 가능)
 *     → INSTAGRAM_ACCESS_TOKEN
 *  5) GET https://graph.instagram.com/me 로 얻은 id → INSTAGRAM_BUSINESS_ACCOUNT_ID
 *
 * 토큰 수명: 대시보드 생성 토큰은 장기 토큰(약 60일). 만료 전에 refreshAccessToken()
 * 으로 갱신해야 한다(24시간 이상 지난 토큰만 갱신 가능, 갱신 시 60일 연장).
 *
 * 게시 흐름: 미디어 컨테이너 생성(비동기로 video_url 에서 영상을 가져감) → 처리 완료 대기(폴링)
 *           → 게시 → 실제 permalink 조회.
 * video_url 은 메타 서버가 로그인 없이 접근 가능한 공개 URL이어야 한다
 * (drive.ts 의 makeFilePublic + driveDirectDownloadUrl 조합 사용).
 */

const GRAPH_BASE = "https://graph.instagram.com";
const GRAPH_VERSION = "v21.0";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 30; // 최대 2.5분 대기

export function hasInstagramEnv(): boolean {
  return Boolean(
    optionalEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID") && optionalEnv("INSTAGRAM_ACCESS_TOKEN")
  );
}

/**
 * 현재 사용할 액세스 토큰.
 * 자동 갱신된 토큰(DB app_settings)이 있으면 그걸 쓰고, 없으면 환경변수(최초 발급본).
 */
const TOKEN_SETTING_KEY = "instagram_access_token";
const REFRESHED_AT_KEY = "instagram_token_refreshed_at";
const ATTEMPT_AT_KEY = "instagram_token_attempt_at";

async function currentAccessToken(): Promise<string> {
  const fromDb = await getSetting(TOKEN_SETTING_KEY);
  return fromDb ?? requireEnv("INSTAGRAM_ACCESS_TOKEN");
}

export interface InstagramUploadResult {
  mediaId: string;
  url: string;
}

async function graphFetch(
  path: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`, init);
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`인스타 API 오류(${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishReelToInstagram(params: {
  /** 로그인 없이 접근 가능한 공개 mp4 URL */
  videoUrl: string;
  caption: string;
}): Promise<InstagramUploadResult> {
  const igUserId = requireEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID");
  const accessToken = await currentAccessToken();

  // 캡션 상한 2,200자 - 넘기면 발행 자체가 실패한다. AI 캡션이 어쩌다 길어져도
  // 발행이 죽는 것보단 뒤가 잘리는 게 낫다 (여유 50자를 남기고 절단).
  const caption =
    params.caption.length > 2150 ? params.caption.slice(0, 2150) : params.caption;

  // 1) 미디어 컨테이너 생성
  const created = await graphFetch(`${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: params.videoUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const creationId = created.id as string | undefined;
  if (!creationId) throw new Error("인스타 미디어 컨테이너 생성 실패: id 없음");

  // 2) 영상 처리(FINISHED) 대기
  let finished = false;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const status = await graphFetch(
      `${creationId}?fields=status_code&access_token=${accessToken}`,
      { method: "GET" }
    );
    const code = status.status_code as string | undefined;
    if (code === "FINISHED") {
      finished = true;
      break;
    }
    if (code === "ERROR") {
      throw new Error(`인스타 영상 처리 실패: ${JSON.stringify(status).slice(0, 300)}`);
    }
  }
  if (!finished) throw new Error("인스타 영상 처리 시간 초과 (2.5분)");

  // 3) 게시
  const published = await graphFetch(`${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  const mediaId = published.id as string | undefined;
  if (!mediaId) throw new Error("인스타 게시 실패: id 없음");

  // 4) 실제 링크 조회
  const permalinkData = await graphFetch(
    `${mediaId}?fields=permalink&access_token=${accessToken}`,
    { method: "GET" }
  );
  const url = (permalinkData.permalink as string | undefined) ?? `https://www.instagram.com/reel/${mediaId}/`;

  return { mediaId, url };
}

/**
 * 장기 액세스 토큰 갱신. 만료(약 60일) 전에 주기적으로 호출해 60일 연장한다.
 * 24시간 이상 지난 토큰만 갱신 가능. 성공 시 새 토큰과 만료까지 남은 초를 돌려준다.
 */
export async function refreshAccessToken(
  currentToken?: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const token = currentToken ?? (await currentAccessToken());
  const data = await graphFetch(
    `refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    { method: "GET" }
  );
  const accessToken = data.access_token as string | undefined;
  const expiresInSeconds = (data.expires_in as number | undefined) ?? 0;
  if (!accessToken) throw new Error("인스타 토큰 갱신 실패: access_token 없음");
  return { accessToken, expiresInSeconds };
}

const DAY_MS = 24 * 3600_000;
/** 갱신 주기: 7일마다 연장 → 만료(60일)까지 항상 50일 이상 여유 유지 */
const REFRESH_INTERVAL_DAYS = 7;

/**
 * 필요 시 토큰 자동 갱신 (렌더 워커가 매 실행마다 호출 - 멱등/저비용).
 * - 마지막 갱신 후 7일이 지나야 실제 갱신을 시도한다.
 * - 시도는 하루 1회로 제한한다 (발급 후 24시간 미만 토큰은 갱신이 거부되므로).
 * - 실패해도 조용히 경고만 남긴다 (다음 날 다시 시도).
 * 갱신된 토큰은 DB(app_settings)에 저장돼 이후 게시에 자동으로 쓰인다.
 */
export async function maybeRefreshInstagramToken(): Promise<void> {
  if (!hasInstagramEnv()) return;

  const now = Date.now();
  const refreshedAt = await getSetting(REFRESHED_AT_KEY);
  if (refreshedAt && now - Date.parse(refreshedAt) < REFRESH_INTERVAL_DAYS * DAY_MS) {
    return; // 아직 갱신할 때가 아님
  }
  const attemptAt = await getSetting(ATTEMPT_AT_KEY);
  if (attemptAt && now - Date.parse(attemptAt) < DAY_MS) {
    return; // 오늘 이미 시도함
  }

  await setSetting(ATTEMPT_AT_KEY, new Date(now).toISOString());
  try {
    const { accessToken, expiresInSeconds } = await refreshAccessToken();
    const saved = await setSetting(TOKEN_SETTING_KEY, accessToken);
    if (saved) {
      await setSetting(REFRESHED_AT_KEY, new Date(now).toISOString());
      console.log(
        `인스타 토큰 자동 갱신 완료 (만료까지 ${Math.round(expiresInSeconds / 86400)}일)`
      );
    } else {
      console.warn("인스타 토큰 갱신됐지만 저장 실패 - 다음에 재시도");
    }
  } catch (e) {
    console.warn(`인스타 토큰 갱신 실패(다음에 재시도): ${(e as Error).message.slice(0, 200)}`);
  }
}

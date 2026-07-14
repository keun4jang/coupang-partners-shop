import { optionalEnv, requireEnv } from "./env";

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
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN");

  // 1) 미디어 컨테이너 생성
  const created = await graphFetch(`${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: params.videoUrl,
      caption: params.caption,
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
 * (자동화: 별도 크론에서 호출해 새 토큰을 INSTAGRAM_ACCESS_TOKEN 에 반영)
 */
export async function refreshAccessToken(
  currentToken?: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const token = currentToken ?? requireEnv("INSTAGRAM_ACCESS_TOKEN");
  const data = await graphFetch(
    `refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    { method: "GET" }
  );
  const accessToken = data.access_token as string | undefined;
  const expiresInSeconds = (data.expires_in as number | undefined) ?? 0;
  if (!accessToken) throw new Error("인스타 토큰 갱신 실패: access_token 없음");
  return { accessToken, expiresInSeconds };
}

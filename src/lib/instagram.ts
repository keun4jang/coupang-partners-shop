import { optionalEnv, requireEnv } from "./env";

/**
 * 인스타그램 릴스 자동 게시 (Meta Graph API).
 *
 * 필요 조건(전부 코드 밖 - 메타 개발자 센터에서 사장님이 직접 설정):
 *  1) 인스타그램 계정을 "비즈니스" 계정으로 전환
 *  2) 페이스북 페이지를 만들어 그 인스타그램 계정과 연결
 *  3) developers.facebook.com 에서 앱 생성(비즈니스 타입) + Instagram Graph API 제품 추가
 *  4) instagram_business_content_publish 권한으로 앱 심사 제출 (보통 2~4주 소요)
 *  5) 심사 통과 후 장기 액세스 토큰 발급 + 인스타그램 비즈니스 계정 ID 확인
 *     → INSTAGRAM_BUSINESS_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN 로 등록
 *
 * 게시 흐름: 미디어 컨테이너 생성(비동기로 video_url 에서 영상을 가져감) → 처리 완료 대기(폴링)
 *           → 게시 → 실제 permalink 조회.
 * video_url 은 메타 서버가 로그인 없이 접근 가능한 공개 URL이어야 한다
 * (drive.ts 의 makeFilePublic + driveDirectDownloadUrl 조합 사용).
 */

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
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, init);
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

import { optionalEnv } from "./env";
import { getSetting } from "./settings";

/**
 * 페이스북 릴스 자동 게시.
 * - 인스타(graph.instagram.com)와 달리 페이스북 페이지(graph.facebook.com)는
 *   페이지 액세스 토큰을 쓴다. 별도 세팅 필요.
 * - 릴스 업로드는 3단계(start → upload → finish). 업로드는 드라이브 공개 URL 을
 *   file_url 로 넘겨 메타 서버가 직접 받아가게 한다(인스타와 동일한 방식).
 *
 * 필요 값(env 우선, 없으면 Supabase app_settings):
 *   FACEBOOK_PAGE_ID              대상 페이지 id
 *   FACEBOOK_PAGE_ACCESS_TOKEN    그 페이지의 장기 액세스 토큰
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 30; // 최대 2.5분

async function pageId(): Promise<string | undefined> {
  return optionalEnv("FACEBOOK_PAGE_ID") ?? (await getSetting("FACEBOOK_PAGE_ID")) ?? undefined;
}
async function pageToken(): Promise<string | undefined> {
  return (
    optionalEnv("FACEBOOK_PAGE_ACCESS_TOKEN") ??
    (await getSetting("FACEBOOK_PAGE_ACCESS_TOKEN")) ??
    undefined
  );
}

/** env 또는 Supabase 에 페이지 id·토큰이 모두 있으면 true */
export async function facebookConfigured(): Promise<boolean> {
  const [id, token] = await Promise.all([pageId(), pageToken()]);
  return Boolean(id && token);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FacebookUploadResult {
  id: string;
  url: string;
}

/**
 * 드라이브 공개 영상 URL 을 페이스북 릴스로 게시한다.
 * 실패 시 throw → 호출부(워커)가 잡아 facebook_error 로 기록.
 */
export async function publishReelToFacebook(params: {
  videoUrl: string;
  caption: string;
}): Promise<FacebookUploadResult> {
  const id = await pageId();
  const token = await pageToken();
  if (!id || !token) throw new Error("페이스북 페이지 ID/토큰 미설정");

  // 1) start: 업로드 세션 생성 → video_id, upload_url
  const startRes = await fetch(`${GRAPH}/${id}/video_reels`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload_phase: "start", access_token: token }),
  });
  const start = (await startRes.json()) as {
    video_id?: string;
    upload_url?: string;
    error?: unknown;
  };
  if (!startRes.ok || !start.video_id || !start.upload_url) {
    throw new Error(`FB 릴스 start 실패: ${JSON.stringify(start).slice(0, 200)}`);
  }
  const videoId = start.video_id;

  // 2) upload: 호스팅된 영상(드라이브 공개 URL)을 메타가 직접 받아가게 한다
  const upRes = await fetch(start.upload_url, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: params.videoUrl },
  });
  const up = (await upRes.json().catch(() => ({}))) as { success?: boolean };
  if (!upRes.ok || up.success === false) {
    throw new Error(`FB 릴스 upload 실패: ${JSON.stringify(up).slice(0, 200)}`);
  }

  // 3) finish: 설명(캡션) 붙여 공개 게시
  const finishUrl =
    `${GRAPH}/${id}/video_reels?upload_phase=finish` +
    `&video_id=${videoId}&video_state=PUBLISHED` +
    `&description=${encodeURIComponent(params.caption)}&access_token=${token}`;
  const finRes = await fetch(finishUrl, { method: "POST" });
  const fin = (await finRes.json()) as { success?: boolean; error?: unknown };
  if (!finRes.ok || fin.success === false) {
    throw new Error(`FB 릴스 finish 실패: ${JSON.stringify(fin).slice(0, 200)}`);
  }

  // 처리(인코딩) 완료까지 상태 폴링 - 게시 확정 확인
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const stRes = await fetch(
      `${GRAPH}/${videoId}?fields=status&access_token=${token}`
    );
    const st = (await stRes.json()) as {
      status?: { video_status?: string; processing_progress?: number };
    };
    const vs = st.status?.video_status;
    if (vs === "ready") break;
    if (vs === "error") throw new Error("FB 릴스 처리 오류(video_status=error)");
    // "processing" 이면 계속 대기
  }

  return { id: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}

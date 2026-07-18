import { google } from "googleapis";
import fs from "fs";
import { optionalEnv, requireEnv } from "./env";

/**
 * 유튜브 쇼츠 자동 업로드.
 * 채널을 소유한 구글 계정이 드라이브 계정과 다를 수 있으므로(예: 별도 채널 전용 계정)
 * 별도 OAuth 자격증명(YOUTUBE_OAUTH_*)을 쓴다 - GOOGLE_OAUTH_*(드라이브)와 독립적.
 * scripts/google-oauth.mjs 를 YOUTUBE_OAUTH_CLIENT_ID/SECRET 로 실행해 발급받는다.
 */

const CATEGORY_HOWTO_STYLE = "26"; // 생활/노하우 카테고리 - 살림템 소개에 적합

function youtubeClient() {
  const clientId = optionalEnv("YOUTUBE_OAUTH_CLIENT_ID");
  const refreshToken = optionalEnv("YOUTUBE_OAUTH_REFRESH_TOKEN");
  if (!clientId || !refreshToken) return null;

  const oauth2 = new google.auth.OAuth2(
    clientId,
    requireEnv("YOUTUBE_OAUTH_CLIENT_SECRET")
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: "v3", auth: oauth2 });
}

export function hasYoutubeEnv(): boolean {
  return Boolean(
    optionalEnv("YOUTUBE_OAUTH_CLIENT_ID") && optionalEnv("YOUTUBE_OAUTH_REFRESH_TOKEN")
  );
}

export interface YoutubeUploadResult {
  videoId: string;
  url: string;
}

export async function uploadShortToYoutube(params: {
  localPath: string;
  title: string;
  description: string;
  tags?: string[];
  /** 기본 public - 완전 자동 게시가 목표이므로 바로 공개 */
  privacyStatus?: "public" | "unlisted" | "private";
}): Promise<YoutubeUploadResult> {
  const youtube = youtubeClient();
  if (!youtube) throw new Error("유튜브 업로드 환경변수 미설정 (GOOGLE_OAUTH_*)");

  const { data } = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: params.title.slice(0, 100),
        description: params.description,
        tags: params.tags,
        categoryId: CATEGORY_HOWTO_STYLE,
      },
      status: {
        privacyStatus: params.privacyStatus ?? "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(params.localPath),
    },
  });

  const videoId = data.id;
  if (!videoId) throw new Error("유튜브 업로드 실패: 응답에 video id 없음");
  return { videoId, url: `https://youtube.com/shorts/${videoId}` };
}

/**
 * 기존 영상의 설명만 교체한다 (제목·태그·카테고리는 현재 값 그대로 보존).
 * videos.update 는 snippet 을 통째로 덮으므로 현재 snippet 을 먼저 읽어 유지한다.
 */
export async function updateYoutubeDescription(
  videoId: string,
  description: string
): Promise<void> {
  const youtube = youtubeClient();
  if (!youtube) throw new Error("유튜브 환경변수 미설정");
  const { data } = await youtube.videos.list({ part: ["snippet"], id: [videoId] });
  const snippet = data.items?.[0]?.snippet;
  if (!snippet) throw new Error(`영상 ${videoId} 조회 실패(권한/삭제 확인)`);
  await youtube.videos.update({
    part: ["snippet"],
    requestBody: {
      id: videoId,
      snippet: {
        title: snippet.title,
        categoryId: snippet.categoryId ?? CATEGORY_HOWTO_STYLE,
        description,
        tags: snippet.tags,
        defaultLanguage: snippet.defaultLanguage ?? undefined,
      },
    },
  });
}

/** 유튜브 제목: "N번 | 제품명 #Shorts" (100자 제한 고려해 제품명은 이미 요약된 값을 받는다) */
export function youtubeTitle(displayNumber: number, shortProductName: string): string {
  return `${displayNumber}번 | ${shortProductName} 살림템 추천 #Shorts`;
}

/**
 * 유튜브 설명: 간단하게. 제품명 + 프로필 링크 안내 + 해시태그만 (대가성 문구 없음).
 * 쇼츠는 설명·댓글의 링크 클릭이 막혀 있어(2023.8~) URL 을 넣어도 모바일에선 안 눌린다.
 * 유일하게 클릭되는 외부 링크는 "채널 프로필 링크"이므로 그쪽으로 유도한다.
 */
export function youtubeDescription(
  displayNumber: number,
  shortProductName: string
): string {
  return [
    shortProductName,
    "",
    `영상 속 제품은 프로필 링크에서 ${displayNumber}번으로 확인하세요 🔎`,
    "",
    "#Shorts #살림템 #생활템 #쿠팡추천템",
  ].join("\n");
}

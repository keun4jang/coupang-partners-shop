import { google } from "googleapis";
import fs from "fs";
import { optionalEnv, requireEnv } from "./env";

/**
 * 유튜브 쇼츠 자동 업로드.
 * 구글 드라이브와 같은 OAuth 사용자 위임(GOOGLE_OAUTH_*)을 재사용한다.
 * 단, 이 refresh token 은 반드시 `youtube.upload` 스코프로 동의된 것이어야 한다
 * (scripts/google-oauth.mjs 로 재발급 - SCOPE 에 이미 포함돼 있음).
 */

const CATEGORY_HOWTO_STYLE = "26"; // 생활/노하우 카테고리 - 살림템 소개에 적합

function youtubeClient() {
  const clientId = optionalEnv("GOOGLE_OAUTH_CLIENT_ID");
  const refreshToken = optionalEnv("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!clientId || !refreshToken) return null;

  const oauth2 = new google.auth.OAuth2(
    clientId,
    requireEnv("GOOGLE_OAUTH_CLIENT_SECRET")
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: "v3", auth: oauth2 });
}

export function hasYoutubeEnv(): boolean {
  return Boolean(
    optionalEnv("GOOGLE_OAUTH_CLIENT_ID") && optionalEnv("GOOGLE_OAUTH_REFRESH_TOKEN")
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

/** 유튜브 제목: "N번 | 제품명 #Shorts" (100자 제한 고려해 제품명은 이미 요약된 값을 받는다) */
export function youtubeTitle(displayNumber: number, shortProductName: string): string {
  return `${displayNumber}번 | ${shortProductName} 살림템 추천 #Shorts`;
}

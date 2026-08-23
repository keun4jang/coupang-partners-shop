import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
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

export type DescriptionUpdateResult =
  | "updated"
  | "alreadyHas"
  | "notFound"
  | "failed";

/**
 * 이미 게시된 영상의 설명(캡션)에 문구를 덧붙인다.
 * 대가성 고지 소급 적용용 - 영상 재렌더·재업로드 없이 설명만 고친다.
 *
 * 비용(units): videos.list = 1, videos.update = 50.
 * update 는 snippet 전체를 덮어쓰므로 title·categoryId·tags 를 그대로 되돌려 보낸다
 * (빠뜨리면 제목이 지워지거나 카테고리가 초기화된다).
 *
 * @param marker 이 문자열이 설명에 이미 있으면 건드리지 않는다(중복 방지)
 */
export async function prependToDescription(
  videoId: string,
  text: string,
  marker: string
): Promise<DescriptionUpdateResult> {
  const youtube = youtubeClient();
  if (!youtube) return "failed";
  try {
    const { data } = await youtube.videos.list({
      part: ["snippet"],
      id: [videoId],
    });
    const item = data.items?.[0];
    if (!item?.snippet) return "notFound";

    const snippet = item.snippet;
    const description = snippet.description ?? "";
    if (description.includes(marker)) return "alreadyHas";

    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: videoId,
        snippet: {
          title: snippet.title ?? "",
          categoryId: snippet.categoryId ?? CATEGORY_HOWTO_STYLE,
          tags: snippet.tags ?? undefined,
          defaultLanguage: snippet.defaultLanguage ?? undefined,
          description: `${text}\n\n${description}`.trim(),
        },
      },
    });
    return "updated";
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/not found|videoNotFound/i.test(msg)) return "notFound";
    console.warn(`설명 수정 실패(${videoId}): ${msg.slice(0, 150)}`);
    return "failed";
  }
}

export function hasYoutubeEnv(): boolean {
  return Boolean(
    optionalEnv("YOUTUBE_OAUTH_CLIENT_ID") && optionalEnv("YOUTUBE_OAUTH_REFRESH_TOKEN")
  );
}

/**
 * app_settings 에 저장된 유튜브 OAuth 자격증명이 있으면 process.env 를 덮어쓴다.
 *
 * 왜: GitHub Actions 의 WORKER_ENV 시크릿에 든 리프레시 토큰이 업로드 스코프만 있고
 * captions/thumbnails 에 필요한 youtube.force-ssl 스코프가 없다("insufficient
 * authentication scopes"). 시크릿은 API 로 갱신할 수 없어, 올바른(force-ssl) 토큰을
 * DB(app_settings)에 두고 워커/백필이 시작 시 이걸 우선하게 한다.
 * (인스타 토큰을 app_settings 로 관리하는 기존 패턴과 동일)
 *
 * 세 값(YOUTUBE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)이 모두 있을 때만 덮어쓴다
 * (리프레시 토큰은 발급한 클라이언트에 묶이므로 쌍으로만 유효).
 * 이후 WORKER_ENV 시크릿을 force-ssl 토큰으로 갱신하면 이 키들은 지워도 된다.
 */
export async function loadYoutubeCredsFromSettings(): Promise<void> {
  try {
    const { getSettings } = await import("./settings");
    // 일괄 조회 + 재시도: 키 하나만 일시 오류로 빠져도 전체 덮어쓰기가 무효가 되므로
    const s = await getSettings([
      "YOUTUBE_OAUTH_CLIENT_ID",
      "YOUTUBE_OAUTH_CLIENT_SECRET",
      "YOUTUBE_OAUTH_REFRESH_TOKEN",
    ]);
    const id = s.YOUTUBE_OAUTH_CLIENT_ID;
    const secret = s.YOUTUBE_OAUTH_CLIENT_SECRET;
    const token = s.YOUTUBE_OAUTH_REFRESH_TOKEN;
    if (id && secret && token) {
      process.env.YOUTUBE_OAUTH_CLIENT_ID = id;
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET = secret;
      process.env.YOUTUBE_OAUTH_REFRESH_TOKEN = token;
      console.log("유튜브 자격증명: app_settings 값 사용(force-ssl 토큰)");
    }
  } catch (e) {
    console.warn("유튜브 자격증명 설정 조회 실패(env 값 유지):", (e as Error).message);
  }
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
  /** 커스텀 썸네일 PNG/JPG 경로. 있으면 업로드 후 thumbnails.set 으로 지정
   *  (Shorts 그리드에 이 이미지가 뜬다). 실패해도 영상 업로드는 유지. */
  thumbnailPath?: string;
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

  // 커스텀 썸네일 지정 (채널 미인증/미지원 시 실패할 수 있으므로 감싸서 무시)
  if (params.thumbnailPath && fs.existsSync(params.thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(params.thumbnailPath) },
      });
      console.log("유튜브 커스텀 썸네일 지정 완료");
    } catch (e) {
      console.warn(
        "유튜브 썸네일 지정 실패(영상은 정상 업로드됨):",
        (e as Error).message.slice(0, 150)
      );
    }
  }

  return { videoId, url: `https://youtube.com/shorts/${videoId}` };
}

/**
 * 유튜브 롱폼(TOP10) 업로드. uploadShortToYoutube 와 달리 #Shorts 분류를
 * 유도하지 않고(가로 영상이라 어차피 Shorts 로 분류되지 않는다 - 2024.10 기준
 * Shorts 판정은 세로/정방형에만 적용), 워치페이지 URL 을 돌려준다.
 */
export async function uploadLongformToYoutube(params: {
  localPath: string;
  title: string;
  description: string;
  tags?: string[];
  thumbnailPath?: string;
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

  if (params.thumbnailPath && fs.existsSync(params.thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(params.thumbnailPath) },
      });
      console.log("유튜브 커스텀 썸네일 지정 완료");
    } catch (e) {
      console.warn(
        "유튜브 썸네일 지정 실패(영상은 정상 업로드됨):",
        (e as Error).message.slice(0, 150)
      );
    }
  }

  return { videoId, url: `https://youtube.com/watch?v=${videoId}` };
}

/**
 * 유튜브 자동자막(ASR)을 화면에서 안 뜨게 억제한다.
 *
 * 원리: 유튜브는 크리에이터가 직접 올린 "표준(standard)" 자막 트랙이 있으면
 * 자동생성(asr) 트랙 대신 그걸 우선한다. 그래서 사실상 비어 있는(공백 한 칸)
 * 한국어 자막 트랙을 올려두면, 자동자막이 표시되지 않는다.
 * 우리 영상은 자막을 이미 화면에 구워 넣으므로 자동자막은 중복·오역만 유발한다.
 *
 * captions.insert 는 400 units(무료 일일 할당량 10,000 내). youtube.force-ssl 스코프 필요.
 * 실패해도(스코프 미부여/할당량 소진 등) 영상 게시엔 영향 없도록 감싸서 무시한다.
 * @returns 수행한 동작 - "inserted"(빈 자막 업로드), "exists"(이미 표준 트랙 있어 스킵),
 *          "notFound"(영상이 삭제/비공개라 영영 처리 불가), "failed"(일시 오류).
 *          백필의 할당량 계산에 쓰인다(inserted≈450, exists/notFound≈50 units).
 */
export type SuppressResult = "inserted" | "exists" | "notFound" | "failed";

export async function suppressAutoCaptions(videoId: string): Promise<SuppressResult> {
  const youtube = youtubeClient();
  if (!youtube) return "failed";
  try {
    // 이미 표준 자막 트랙이 있으면(재실행 등) 중복 삽입하지 않는다.
    const existing = await youtube.captions.list({ part: ["snippet"], videoId });
    const hasStandard = existing.data.items?.some(
      (c) => c.snippet?.trackKind !== "asr" && c.snippet?.language === "ko"
    );
    if (hasStandard) {
      console.log("유튜브 표준 자막 트랙 이미 존재 - 자동자막 억제 스킵");
      return "exists";
    }

    // 공백 한 칸짜리 SRT (실질적으로 안 보이지만 "표준 트랙"으로 인정됨)
    const srt = "1\n00:00:00,000 --> 00:00:00,400\n \n";
    await youtube.captions.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          videoId,
          language: "ko",
          name: "",
          isDraft: false,
        },
      },
      media: {
        mimeType: "application/octet-stream",
        body: Readable.from(Buffer.from(srt, "utf8")),
      },
    });
    console.log("유튜브 자동자막 억제 완료(빈 표준 자막 업로드):", videoId);
    return "inserted";
  } catch (e) {
    // 삭제/비공개 영상은 재시도해도 영영 안 되므로 구분해서 알린다 (백필이 완료 처리).
    const err = e as Error & { errors?: Array<{ reason?: string }> };
    const notFound =
      err.errors?.some((it) => it.reason === "videoNotFound") ||
      /could not be found/i.test(err.message);
    if (notFound) {
      console.warn("유튜브 영상 없음(삭제/비공개 추정) - 자동자막 억제 불가:", videoId);
      return "notFound";
    }
    console.warn("유튜브 자동자막 억제 실패(영상은 정상):", err.message.slice(0, 150));
    return "failed";
  }
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
    `영상 속 제품은 프로필 링크 누르면 바로 나와요 🔎 (${displayNumber}번)`,
    "",
    "#Shorts #살림템 #생활템 #쿠팡추천템",
  ].join("\n");
}

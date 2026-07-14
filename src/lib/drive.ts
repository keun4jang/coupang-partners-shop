import { google, drive_v3 } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { optionalEnv, requireEnv } from "./env";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

/**
 * Drive 클라이언트.
 * 1) OAuth 사용자 위임(GOOGLE_OAUTH_*)이 있으면 우선 사용 → 업로드가 사용자
 *    구글 계정(개인 15GB) 소유로 저장됨. 일반 Gmail에서 유일하게 되는 방식.
 * 2) 없으면 서비스 계정(GOOGLE_CLIENT_EMAIL/PRIVATE_KEY)으로 폴백.
 *    단 서비스 계정은 자체 저장 용량이 없어 개인 드라이브 '내 드라이브' 폴더에는
 *    파일 업로드가 실패한다(공용 드라이브/Workspace 위임에서만 가능).
 */
function driveClient(): drive_v3.Drive {
  const clientId = optionalEnv("GOOGLE_OAUTH_CLIENT_ID");
  const refreshToken = optionalEnv("GOOGLE_OAUTH_REFRESH_TOKEN");

  if (clientId && refreshToken) {
    const oauth2 = new google.auth.OAuth2(
      clientId,
      requireEnv("GOOGLE_OAUTH_CLIENT_SECRET")
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    return google.drive({ version: "v3", auth: oauth2 });
  }

  const auth = new google.auth.JWT({
    email: requireEnv("GOOGLE_CLIENT_EMAIL"),
    key: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: [DRIVE_SCOPE],
  });
  return google.drive({ version: "v3", auth });
}

// 같은 프로세스 안에서 날짜 폴더 조회/생성을 중복 호출하지 않도록 캐시한다.
// Drive API는 폴더명 유일성을 강제하지 않으므로, 워커 프로세스를 동시에
// 여러 개 실행하면 이 list→create 사이 경합으로 같은 날짜 폴더가 두 개
// 생길 수 있다 - 렌더 워커는 인스턴스 하나만 실행하는 것을 전제로 한다.
const dateFolderCache = new Map<string, Promise<string>>();

/** 루트 폴더 아래 날짜 폴더(YYYY-MM-DD)를 찾거나 생성 */
export function ensureDateFolder(dateName: string): Promise<string> {
  const cached = dateFolderCache.get(dateName);
  if (cached) return cached;

  const promise = (async () => {
    const drive = driveClient();
    const rootId = requireEnv("GOOGLE_DRIVE_FOLDER_ID");

    const escaped = dateName.replace(/'/g, "\\'");
    const { data } = await drive.files.list({
      q: `'${rootId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (data.files && data.files.length > 0 && data.files[0].id) {
      return data.files[0].id;
    }

    const { data: created } = await drive.files.create({
      requestBody: {
        name: dateName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!created.id) throw new Error("드라이브 날짜 폴더 생성 실패");
    return created.id;
  })();

  // 실패한 조회는 캐시에서 제거해 다음 호출이 재시도할 수 있게 한다.
  promise.catch(() => dateFolderCache.delete(dateName));
  dateFolderCache.set(dateName, promise);
  return promise;
}

export interface DriveUploadResult {
  id: string;
  url: string;
}

async function uploadToFolder(
  folderId: string,
  name: string,
  mimeType: string,
  body: Readable
): Promise<DriveUploadResult> {
  const drive = driveClient();
  const { data } = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!data.id) throw new Error(`드라이브 업로드 실패: ${name}`);
  return {
    id: data.id,
    url: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function uploadFileToDrive(
  folderId: string,
  name: string,
  mimeType: string,
  localPath: string
): Promise<DriveUploadResult> {
  return uploadToFolder(folderId, name, mimeType, fs.createReadStream(localPath));
}

export async function uploadTextToDrive(
  folderId: string,
  name: string,
  text: string
): Promise<DriveUploadResult> {
  return uploadToFolder(
    folderId,
    name,
    "text/plain",
    Readable.from([Buffer.from(text, "utf-8")])
  );
}

/**
 * 파일을 "링크가 있는 모든 사용자" 읽기 권한으로 공개한다.
 * 유튜브/인스타 등 외부 서비스가 로그인 없이 직접 내려받아야 할 때(예: 인스타 릴스 게시 API가
 * video_url 을 자기 서버에서 fetch) 필요. 이미 게시할 영상이라 공개해도 문제 없다.
 */
export async function makeFilePublic(fileId: string): Promise<void> {
  const drive = driveClient();
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });
}

/** 로그인 없이 바이너리를 직접 내려받을 수 있는 링크 (makeFilePublic 후에만 유효) */
export function driveDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

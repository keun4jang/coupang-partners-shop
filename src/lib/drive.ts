import { google, drive_v3 } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import { requireEnv } from "./env";

function driveClient(): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: requireEnv("GOOGLE_CLIENT_EMAIL"),
    key: requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
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

async function uploadToFolder(
  folderId: string,
  name: string,
  mimeType: string,
  body: Readable
): Promise<string> {
  const drive = driveClient();
  const { data } = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!data.id) throw new Error(`드라이브 업로드 실패: ${name}`);
  return data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`;
}

export async function uploadFileToDrive(
  folderId: string,
  name: string,
  mimeType: string,
  localPath: string
): Promise<string> {
  return uploadToFolder(folderId, name, mimeType, fs.createReadStream(localPath));
}

export async function uploadTextToDrive(
  folderId: string,
  name: string,
  text: string
): Promise<string> {
  return uploadToFolder(
    folderId,
    name,
    "text/plain",
    Readable.from([Buffer.from(text, "utf-8")])
  );
}

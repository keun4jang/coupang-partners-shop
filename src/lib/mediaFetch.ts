/**
 * 원격 이미지를 워커(Node)가 받아서 data URI 로 바꾼다.
 * Remotion 렌더 브라우저가 CDN 에서 직접 못 받는 경우(차단/타임아웃) 대비 -
 * 렌더 전에 이미지를 props 에 미리 심어 브라우저가 아예 네트워크를 안 타게 한다.
 * render-worker.ts(숏폼)·worker/longform-worker.ts(롱폼)가 공유한다.
 */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface FetchedImage {
  buffer: Buffer;
  /** "image/jpeg" 처럼 파라미터를 뗀 형태 */
  mimeType: string;
}

/**
 * 원격 이미지를 버퍼로 받는다. 실패(네트워크·비이미지·용량초과)는 null.
 * data URI 가 필요하면 fetchImageAsDataUri, 비전 API 에 태우려면 이 함수를 쓴다.
 */
export async function fetchImageBuffer(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > IMAGE_MAX_BYTES) return null;
    return { buffer, mimeType: type.split(";")[0] };
  } catch {
    return null;
  }
}

export async function fetchImageAsDataUri(url: string): Promise<string | null> {
  const img = await fetchImageBuffer(url);
  if (!img) return null;
  return `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;
}

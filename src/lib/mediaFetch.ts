/**
 * 원격 이미지를 워커(Node)가 받아서 data URI 로 바꾼다.
 * Remotion 렌더 브라우저가 CDN 에서 직접 못 받는 경우(차단/타임아웃) 대비 -
 * 렌더 전에 이미지를 props 에 미리 심어 브라우저가 아예 네트워크를 안 타게 한다.
 * render-worker.ts(숏폼)·worker/longform-worker.ts(롱폼)가 공유한다.
 */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function fetchImageAsDataUri(url: string): Promise<string | null> {
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
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > IMAGE_MAX_BYTES) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

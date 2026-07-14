import sharp from "sharp";

/**
 * 이미지 지문(perceptual hash, dHash) - "같은 제품 사진인가" 판별용.
 *
 * 알리익스프레스에서 검색된 후보 상품이 우리 쿠팡 상품과 실제로 같은 물건인지
 * 확인하기 위해 쓴다: 두 이미지의 dHash 해밍 거리가 임계치 이하일 때만 매칭 인정.
 * (해상도/워터마크/약간의 색감 차이에는 강하고, 다른 제품이면 거리가 확 벌어진다)
 */

const HASH_W = 9;
const HASH_H = 8; // 9x8 그레이스케일 → 가로 인접 픽셀 비교 64비트

export type ImageHash = bigint;

/** 이미지 버퍼 → 64비트 dHash */
export async function dhashFromBuffer(buf: Buffer): Promise<ImageHash> {
  const raw = await sharp(buf)
    .grayscale()
    .resize(HASH_W, HASH_H, { fit: "fill" })
    .raw()
    .toBuffer();
  let hash = 0n;
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const left = raw[y * HASH_W + x];
      const right = raw[y * HASH_W + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/** URL 에서 이미지를 받아 dHash 계산. 실패 시 null */
export async function dhashFromUrl(url: string): Promise<ImageHash | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return null;
    return await dhashFromBuffer(buf);
  } catch {
    return null;
  }
}

/** 두 해시의 해밍 거리 (0=동일, 64=완전 다름) */
export function hammingDistance(a: ImageHash, b: ImageHash): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * 매칭 판정 임계치.
 * 실측 기준: 같은 제품 사진(다른 해상도/배경 살짝 다름)은 대개 0~8,
 * 다른 제품은 20+ 로 벌어진다. 10 이하만 "같은 제품"으로 인정한다.
 */
export const MATCH_THRESHOLD = 10;

/**
 * 상품 사진 누끼(배경 지우기) - 장면 합성용 (2026-10-20 사장님 "완전 자동으로, 사진 한 장으론 역부족" → 제안 A "추천대로 진행").
 *
 * 쿠팡 대표 사진은 대개 흰색·회색 단색 바탕이다. 테두리에서 바탕색과 비슷한 픽셀을 이어서 지워(flood fill)
 * 상품만 남긴다. 무료·CPU(sharp)만 쓴다 - AI 모델·유료 API 없음.
 * 바탕이 단색이 아니면(풀밭에 의자가 놓인 연출 사진 등) 억지로 오리면 지저분해지므로 null - 호출부는 합성을 건너뛴다.
 * 상품 모양은 건드리지 않는다(위치·크기만 바꿈) - 실제와 다른 모습을 보여 주지 않기 위해.
 */
import sharp from "sharp";

export type CutoutResult = { dataUri: string; fgRatio: number; width: number; height: number };

const MAX_SIDE = 800;
/** 바탕색과 이만큼(RGB 거리) 가까우면 바탕으로 본다 */
const TOL = 34;
/** 테두리 픽셀 중 이 비율 이상이 바탕색이어야 "단색 바탕"으로 인정 */
const BORDER_UNIFORM = 0.8;

function dist(r: number, g: number, b: number, c: [number, number, number]): number {
  const dr = r - c[0], dg = g - c[1], db = b - c[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 이미지 버퍼 → 누끼 PNG. 단색 바탕이 아니거나 상품이 너무 작거나 크면 이유와 함께 null */
export async function cutoutFromBuffer(input: Buffer): Promise<{ ok: CutoutResult | null; reason: string }> {
  const { data, info } = await sharp(input)
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const px = (i: number) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]] as const;

  // 테두리 픽셀 모으기
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);

  // 바탕색 = 테두리 색의 중앙값 (모서리 하나에 글씨·로고가 있어도 흔들리지 않게)
  const med = (k: number) => {
    const v = border.map((i) => data[i * 3 + k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const bg: [number, number, number] = [med(0), med(1), med(2)];
  const uniform = border.filter((i) => {
    const [r, g, b] = px(i);
    return dist(r, g, b, bg) < TOL;
  }).length / border.length;
  if (uniform < BORDER_UNIFORM) return { ok: null, reason: `단색 바탕 아님 (테두리 ${Math.round(uniform * 100)}%)` };

  // 테두리에서 바탕색으로 이어진 영역 지우기
  const isBg = new Uint8Array(N);
  const stack: number[] = [];
  for (const i of border) {
    const [r, g, b] = px(i);
    if (dist(r, g, b, bg) < TOL) {
      isBg[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W, y = (i / W) | 0;
    const next = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of next) {
      if (j < 0 || isBg[j]) continue;
      const [r, g, b] = px(j);
      if (dist(r, g, b, bg) < TOL) {
        isBg[j] = 1;
        stack.push(j);
      }
    }
  }

  // 상품 옆 작은 글씨·구성품 아이콘 조각은 지운다 - 가장 큰 덩어리의 20% 보다 작은 덩어리는 바탕으로 돌린다
  const label = new Int32Array(N).fill(-1);
  const areas: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (isBg[s0] || label[s0] >= 0) continue;
    const id = areas.length;
    let area = 0;
    label[s0] = id;
    const st = [s0];
    while (st.length) {
      const i = st.pop()!;
      area++;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!isBg[j] && label[j] < 0) {
            label[j] = id;
            st.push(j);
          }
        }
      }
    }
    areas.push(area);
  }
  const biggest = Math.max(0, ...areas);
  for (let i = 0; i < N; i++) if (!isBg[i] && areas[label[i]] < biggest * 0.2) isBg[i] = 1;

  let fg = 0;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let i = 0; i < N; i++) {
    if (isBg[i]) continue;
    fg++;
    const x = i % W, y = (i / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const fgRatio = fg / N;
  if (fgRatio < 0.05) return { ok: null, reason: `상품이 너무 작음 (${Math.round(fgRatio * 100)}%)` };
  if (fgRatio > 0.9) return { ok: null, reason: `바탕이 거의 없음 (${Math.round(fgRatio * 100)}%)` };

  // 알파: 경계를 살짝 부드럽게 (1px 흐림 후 안쪽으로 당겨 흰 테두리 줄이기)
  const mask = Buffer.alloc(N);
  for (let i = 0; i < N; i++) mask[i] = isBg[i] ? 0 : 255;
  const soft = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer(); // blur 가 3채널로 바꿔 내보내므로 한 채널만
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = Math.max(0, Math.min(255, (soft[i] - 70) * 1.6));
  }
  const pad = 4;
  const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
  const width = Math.min(W, maxX + pad + 1) - left, height = Math.min(H, maxY + pad + 1) - top;
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width, height })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return {
    ok: { dataUri: `data:image/png;base64,${png.toString("base64")}`, fgRatio, width, height },
    reason: "ok",
  };
}

/** 상품 사진 주소 → 누끼. 실패하면 null (이유는 로그) */
export async function cutoutProduct(url: string): Promise<CutoutResult | null> {
  try {
    let buf: Buffer;
    if (url.startsWith("data:")) {
      buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`누끼: 사진 받기 실패 (${res.status})`);
        return null;
      }
      buf = Buffer.from(await res.arrayBuffer());
    }
    const r = await cutoutFromBuffer(buf);
    console.log(`누끼: ${r.reason}${r.ok ? ` (상품 ${Math.round(r.ok.fgRatio * 100)}%, ${r.ok.width}x${r.ok.height})` : " - 장면 합성 건너뜀"}`);
    return r.ok;
  } catch (e) {
    console.warn(`누끼 실패: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

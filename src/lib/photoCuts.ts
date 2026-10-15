/**
 * 근사장 본인 상품: 윙 사진 여러 장 → 배경 컷 (2026-10-12 사장님 샘플 승인 "지금 좋아요",
 * 순서 승인 "추천대로 진행" - 10/19 시작, 근사장 영상끼리 홀짝 비교).
 *
 * 지금 근사장 영상 배경은 상품과 무관한 스톡이거나 흐린 사진 1장이다. 판매자 본인 상품은
 * 윙에 사진이 3~12장 있으니(OWN_IMAGES) 사진마다 확대·이동을 걸어 컷으로 만든다.
 * 무료(시스템 ffmpeg - render.yml 이 설치) - 유료 AI 영상 생성은 쓰지 않는다(비용 0원 원칙).
 *
 * 시험: 10/19 이후 렌더되는 근사장 영상 중 홀수 번호만 여러 컷, 짝수는 기존 그대로.
 * broll_origin 에 PHOTO_CUTS_ORIGIN 이 남아 두 그룹을 가를 수 있다.
 * 끄기: app_settings own_photo_cuts = off.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { OWN_PRODUCTS, ownImageUrls, isOwnProduct, type Own } from "./ownProducts";

const BROLL_DIR = path.resolve("public/assets/broll");
export const PHOTO_CUTS_START = "2026-10-19T00:00:00+09:00";
export const PHOTO_CUTS_ORIGIN = "근사장 사진 여러 컷";
const FPS = 30;
const CLIP_SECONDS = 4;

/** 이 영상이 시험군(여러 컷)인가 - 근사장 상품 · 시작일 이후 · 홀수 번호 */
export function inPhotoCutsArm(
  product: { source_memo?: string | null },
  displayNumber: number,
  now: Date = new Date()
): boolean {
  return isOwnProduct(product) && now >= new Date(PHOTO_CUTS_START) && displayNumber % 2 === 1;
}

/** DB 상품 → OWN_PRODUCTS 항목 (상품명 또는 상품 페이지 주소의 productId 로 찾는다) */
export function findOwn(product: { product_name: string; affiliate_url?: string | null }): Own | null {
  return (
    OWN_PRODUCTS.find(
      (o) =>
        o.name === product.product_name ||
        Boolean(product.affiliate_url?.includes(`/vp/products/${o.productId}?`))
    ) ?? null
  );
}

/** 사진 네 모서리 평균색 - 여백을 사진 바탕색으로 채워 회색 바탕 사진이 네모 칸처럼 보이지 않게 */
async function cornerColor(file: string): Promise<string> {
  const img = sharp(file);
  const { width = 0, height = 0 } = await img.metadata();
  const s = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const spots = [
    [0, 0],
    [width - s, 0],
    [0, height - s],
    [width - s, height - s],
  ];
  let r = 0, g = 0, b = 0;
  for (const [left, top] of spots) {
    // stats() 는 extract 를 무시하고 원본 전체를 재므로 잘라낸 픽셀을 직접 평균 낸다
    const px = await sharp(file).extract({ left, top, width: s, height: s }).removeAlpha().raw().toBuffer();
    for (let i = 0; i < px.length; i += 3) {
      r += px[i]; g += px[i + 1]; b += px[i + 2];
    }
  }
  const n = s * s * spots.length;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `0x${hex(r)}${hex(g)}${hex(b)}`;
}

/** 컷 움직임: 천천히 확대 → 확대한 채 옆으로 훑기 → 확대에서 축소 (순환) */
const MOVES = [
  { z: `1+0.25*on/${CLIP_SECONDS * FPS}`, x: "iw/2-(iw/zoom/2)" },
  { z: "1.8", x: `(iw-iw/zoom)*on/${CLIP_SECONDS * FPS}` },
  { z: `1.35-0.35*on/${CLIP_SECONDS * FPS}`, x: "iw/2-(iw/zoom/2)" },
];

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
}

/**
 * 사진 1장뿐인 상품(파트너스 - 쿠팡 API 는 대표 사진 1장만 준다)용 움직임 (2026-10-15).
 * 같은 사진이라도 "전체 → 왼쪽 위 디테일 → 가운데 확대 → 오른쪽 아래 훑기 → 축소"로
 * 보는 곳을 바꿔 상품이 화면을 계속 채우게 한다. x·y 는 확대된 사진 안에서의 시선 위치.
 */
const F = CLIP_SECONDS * FPS;
const SINGLE_MOVES = [
  { z: `1+0.12*on/${F}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  { z: "2.0", x: `(iw-iw/zoom)*(0.15+0.25*on/${F})`, y: "(ih-ih/zoom)*0.25" },
  { z: `1.5+0.6*on/${F}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  { z: "2.0", x: `(iw-iw/zoom)*(0.85-0.25*on/${F})`, y: "(ih-ih/zoom)*0.75" },
  { z: `2.2-1.1*on/${F}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  { z: "1.4", x: `(iw-iw/zoom)*on/${F}`, y: "ih/2-(ih/zoom/2)" },
];

/** 근사장 상품: 윙 사진 여러 장 → 배경 컷 */
export async function makePhotoCuts(
  own: Own,
  displayNumber: number,
  count: number,
  orientation: "portrait" | "landscape"
): Promise<string[]> {
  return makeImageCuts(ownImageUrls(own), `own-${displayNumber}`, count, orientation);
}

/**
 * 사진 URL 들 → 배경 컷 count 개 (public/assets/broll 기준 파일명). 사진이 컷보다 많으면 마지막 컷은
 * 남은 사진을 0.5초씩 넘기는 색상·구성 몰아보기. 사진이 1장이면 SINGLE_MOVES 로 시선을 옮겨 가며
 * count 컷을 만든다. 실패하면 빈 배열(호출부가 기존 경로로 폴백).
 */
export async function makeImageCuts(
  urls: string[],
  key: string,
  count: number,
  orientation: "portrait" | "landscape"
): Promise<string[]> {
  const [W, H] = orientation === "portrait" ? [1080, 1920] : [1280, 720];
  const side = Math.min(W, H);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${key}-`));
  const photos: { file: string; bg: string }[] = [];
  for (const [i, url] of urls.slice(0, 12).entries()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const file = path.join(tmp, `p${i}.jpg`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      photos.push({ file, bg: await cornerColor(file) });
    } catch (e) {
      console.warn(`사진 ${i} 받기 실패: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (photos.length === 0) return [];

  const clip = (p: { file: string; bg: string }, z: string, x: string, frames: number, out: string, y = "ih/2-(ih/zoom/2)") =>
    ffmpeg([
      "-loop", "1", "-i", p.file,
      "-vf",
      `scale=${side * 2}:${side * 2}:force_original_aspect_ratio=decrease,pad=${side * 2}:${side * 2}:(ow-iw)/2:(oh-ih)/2:${p.bg},` +
        `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${side}x${side}:fps=${FPS},` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${p.bg},setsar=1,format=yuv420p`,
      "-frames:v", String(frames), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      out,
    ]);

  const single = photos.length === 1;
  const montage = !single && photos.length > count && count > 1;
  const singles = montage ? photos.slice(0, count - 1) : photos.slice(0, count);
  const files: string[] = [];
  try {
    if (single) {
      for (let i = 0; i < count; i++) {
        const name = `${key}-${i}.mp4`;
        const m = SINGLE_MOVES[i % SINGLE_MOVES.length];
        clip(photos[0], m.z, m.x, F, path.join(BROLL_DIR, name), m.y);
        files.push(name);
      }
    } else singles.forEach((p, i) => {
      const name = `${key}-${i}.mp4`;
      const m = MOVES[i % MOVES.length];
      clip(p, m.z, m.x, CLIP_SECONDS * FPS, path.join(BROLL_DIR, name));
      files.push(name);
    });
    if (montage) {
      const rest = photos.slice(count - 1, count - 1 + CLIP_SECONDS * 2);
      const parts = rest.map((p, i) => {
        const out = path.join(tmp, `m${i}.mp4`);
        clip(p, "1.05", "iw/2-(iw/zoom/2)", FPS / 2, out);
        return out;
      });
      const list = path.join(tmp, "list.txt");
      fs.writeFileSync(list, parts.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
      const name = `${key}-${singles.length}.mp4`;
      ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(BROLL_DIR, name)]);
      files.push(name);
    }
  } catch (e) {
    console.warn(`사진 컷 만들기 실패: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return files;
}

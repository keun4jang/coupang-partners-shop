/**
 * 누끼(src/lib/cutout.ts) 자가 점검 - marketer:gate 에서 돈다.
 * 1) 흰 바탕 + 상품(네모) + 작은 글씨 조각 → 성공, 조각은 지워져 상품 크기로 잘림
 * 2) 바탕이 알록달록한 연출 사진 → null (억지로 오리지 않는다)
 */
import sharp from "sharp";
import { cutoutFromBuffer } from "../src/lib/cutout";

async function main() {
  let fail = 0;
  const W = 400, H = 400;
  const white = Buffer.alloc(W * H * 3, 255);
  for (let y = 100; y < 300; y++) for (let x = 80; x < 320; x++) {
    const i = (y * W + x) * 3;
    white[i] = 70; white[i + 1] = 110; white[i + 2] = 60;
  }
  for (let y = 360; y < 366; y++) for (let x = 20; x < 30; x++) {
    const i = (y * W + x) * 3;
    white[i] = 0; white[i + 1] = 0; white[i + 2] = 0;
  }
  const a = await cutoutFromBuffer(await sharp(white, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
  const okA = a.ok !== null && a.ok.width <= 250 && a.ok.height <= 210;
  console.log(`${okA ? "OK " : "NG "} 흰 바탕 상품 → ${a.reason}${a.ok ? ` ${a.ok.width}x${a.ok.height}` : ""} (조각 제거·상품 크기로 자르기)`);
  if (!okA) fail++;

  const noisy = Buffer.alloc(W * H * 3);
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 7919 + (i >> 5) * 104729) % 256;
  const b = await cutoutFromBuffer(await sharp(noisy, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
  const okB = b.ok === null;
  console.log(`${okB ? "OK " : "NG "} 알록달록 바탕 → ${b.reason} (건너뛰어야 함)`);
  if (!okB) fail++;

  if (fail) {
    console.error(`❌ 누끼 점검 ${fail}건 실패`);
    process.exit(1);
  }
  console.log("✅ 누끼 점검 통과");
}
main();

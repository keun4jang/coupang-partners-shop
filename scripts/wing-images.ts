/**
 * 근사장 본인 상품의 윙 이미지 목록 확인 (2026-10-12, 읽기 전용).
 * 윙 키가 동작하는지 + 상품마다 추가 이미지·상세 이미지가 몇 장인지 본다.
 * 결과(이미지 경로)는 src/lib/ownProducts.ts 에 반영해 렌더가 쓰게 한다.
 * 키 값은 출력하지 않는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { fetchWingProductImages, hasWingEnv } from "../src/lib/coupang";
import { OWN_PRODUCTS } from "../src/lib/ownProducts";

async function main(): Promise<void> {
  if (!hasWingEnv()) {
    console.log("윙 키 없음: COUPANG_WING_VENDOR_ID / ACCESS_KEY / SECRET_KEY 시크릿 확인");
    process.exit(1);
  }
  console.log(`윙 키 확인: access …${process.env.COUPANG_WING_ACCESS_KEY!.slice(-4)}`);
  const out: Record<string, { gallery: string[]; detail: string[] }> = {};
  for (const o of OWN_PRODUCTS) {
    try {
      const r = await fetchWingProductImages(o.inv);
      out[o.inv] = { gallery: r.gallery, detail: r.detail };
      console.log(`${o.inv} ${o.name.slice(0, 24)} - 추가 이미지 ${r.gallery.length}장 · 상세 이미지 ${r.detail.length}장`);
    } catch (e) {
      console.log(`${o.inv} 실패: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }
  }
  console.log("JSON_START");
  console.log(JSON.stringify(out));
  console.log("JSON_END");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 근사장 사진 여러 컷 자가 점검 (2026-10-12). 시험군 판정만 확인한다(네트워크·ffmpeg 없음).
 * 실제 컷 생성 확인: npx tsx scripts/photo-cuts-selftest.ts --make (PC 에서, ffmpeg 필요)
 */
import { findOwn, inPhotoCutsArm, makePhotoCuts } from "../src/lib/photoCuts";
import { OWN_MARKER, OWN_PRODUCTS } from "../src/lib/ownProducts";

let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "OK " : "NG "} ${label}`);
  if (!ok) fail++;
};
const own = { source_memo: `${OWN_MARKER} 근사장` };
const partner = { source_memo: "scout" };
const after = new Date("2026-10-19T09:00:00+09:00");
const before = new Date("2026-10-18T23:00:00+09:00");
check("근사장 · 시작 후 · 홀수 → 시험군", inPhotoCutsArm(own, 419, after));
check("근사장 · 시작 후 · 짝수 → 대조군", !inPhotoCutsArm(own, 420, after));
check("근사장 · 시작 전 → 아님", !inPhotoCutsArm(own, 419, before));
check("파트너스 상품 → 아님", !inPhotoCutsArm(partner, 419, after));
check("상품명으로 찾기", findOwn({ product_name: OWN_PRODUCTS[0].name })?.inv === OWN_PRODUCTS[0].inv);
check(
  "상품 주소로 찾기",
  findOwn({ product_name: "x", affiliate_url: `https://www.coupang.com/vp/products/${OWN_PRODUCTS[1].productId}?vendorItemId=1` })?.inv === OWN_PRODUCTS[1].inv
);

async function main() {
  if (process.argv.includes("--make")) {
    const files = await makePhotoCuts(OWN_PRODUCTS[0], 99413, 6, "portrait");
    check(`컷 생성 6개 (${files.join(", ")})`, files.length === 6);
  }
  console.log(fail ? `❌ ${fail}건 실패` : "✅ 전부 통과");
  process.exit(fail ? 1 : 0);
}
main();

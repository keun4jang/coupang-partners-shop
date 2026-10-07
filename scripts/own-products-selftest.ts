/**
 * 사장님 본인 상품 경로 자가 점검 (2026-10-07). API·DB 없이 돈다.
 *  - 링크: 파트너스 링크가 아니라 상품 페이지(affiliate_url)로 간다
 *  - 고지: 캡션·설명에 파트너스 고지가 없고 판매자 고지가 정확히 한 번 있다
 *  - 파트너스 상품은 기존 그대로
 * 실행: npx tsx scripts/own-products-selftest.ts
 */
import { productTargetUrl } from "../src/lib/format";
import { instagramCaption, youtubeShortsDescription } from "../src/lib/publishCopy";
import { DISCLOSURE_LINE } from "../src/lib/policy";
import { isOwnProduct, OWN_DISCLOSURE_LINE, OWN_MARKER } from "../src/lib/ownProducts";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  if (!cond) {
    failures++;
    console.error(`✗ ${label}${detail ? `\n   ${detail}` : ""}`);
  }
};
const count = (text: string, s: string) => text.split(s).length - 1;

const own = {
  source: "coupang",
  coupang_partner_url: null,
  affiliate_url: "https://www.coupang.com/vp/products/9759033951?vendorItemId=96135407807",
  source_memo: `${OWN_MARKER} [own:16401937393] · 근사장 본인 판매 상품`,
};
const partner = {
  source: "coupang",
  coupang_partner_url: "https://link.coupang.com/a/abc",
  affiliate_url: null,
  source_memo: "스카우트 · [cpid:1]",
};

check("본인 상품 판정", isOwnProduct(own) && !isOwnProduct(partner));
check("본인 상품 링크 = 상품 페이지", productTargetUrl(own) === own.affiliate_url, String(productTargetUrl(own)));
check("파트너스 링크는 그대로", productTargetUrl(partner) === partner.coupang_partner_url);

const aiCaption = [
  "캠핑 밤공기 쌀쌀할 때 생각나는 거요.",
  "가볍게 걸치는 판초예요.",
  "",
  "쿠팡에서 찾은 살림템을 번호로 정리하고 있어요.",
  "프로필 첫 화면에 최근 번호 정리해 뒀어요. (412번)",
  "",
  "#캠핑 #판초",
].join("\n");

const ownCap = instagramCaption(aiCaption, 412, { own: true });
check("본인 캡션: 파트너스 고지 없음", !ownCap.includes(DISCLOSURE_LINE), ownCap);
check("본인 캡션: 판매자 고지 1회", count(ownCap, OWN_DISCLOSURE_LINE) === 1, ownCap);
check("본인 캡션: 파트너스용 문장 제거", !ownCap.includes("쿠팡에서 찾은 살림템"), ownCap);
check("본인 캡션: [광고] 없음", !ownCap.includes("[광고]"));

const ownDesc = youtubeShortsDescription(412, "입는 판초 블랭킷", "classic", { own: true });
check("본인 설명: 파트너스 고지 없음", !ownDesc.includes(DISCLOSURE_LINE), ownDesc);
check("본인 설명: 판매자 고지 1회", count(ownDesc, OWN_DISCLOSURE_LINE) === 1, ownDesc);

const pCap = instagramCaption(aiCaption, 412);
check("파트너스 캡션: 파트너스 고지 1회", count(pCap, DISCLOSURE_LINE) === 1, pCap);
check("파트너스 캡션: 판매자 고지 없음", !pCap.includes(OWN_DISCLOSURE_LINE));

if (failures > 0) {
  console.error(`\n본인 상품 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("본인 상품 자가 점검 통과");

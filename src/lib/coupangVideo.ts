/**
 * 쿠팡 파트너스 링크 → 상품 페이지 주소 변환.
 *
 * 2026-10-03: 이 파일에 있던 쿠팡 상세페이지 스크래퍼(판매자 영상 긁어오기)는
 * 삭제했다. 쿠팡 8월 약관이 스크래핑을 금지하고, 판매자 영상 재사용은 저작권
 * 위험이 있다. 딥링크 발급(lib/subLinks.ts)에 필요한 주소 변환만 남긴다.
 */
export function productPageUrlFromPartnerUrl(partnerUrl: string): string | null {
  try {
    const u = new URL(partnerUrl);
    const pageKey = u.searchParams.get("pageKey");
    if (!pageKey) return null;
    const itemId = u.searchParams.get("itemId");
    const vendorItemId = u.searchParams.get("vendorItemId");
    const qs = new URLSearchParams();
    if (itemId) qs.set("itemId", itemId);
    if (vendorItemId) qs.set("vendorItemId", vendorItemId);
    const tail = qs.toString();
    return `https://www.coupang.com/vp/products/${pageKey}${tail ? `?${tail}` : ""}`;
  } catch {
    return null;
  }
}

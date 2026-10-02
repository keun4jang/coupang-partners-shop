import type { MetadataRoute } from "next";

/**
 * 검색엔진 안내 (2026-10-03). 쿠팡으로 보내는 입구(/go, /api)와 관리자 화면은
 * 색인하지 않는다 - 검색 크롤러가 제휴 링크를 따라가 클릭으로 잡히거나, 링크
 * 모음 페이지가 저품질로 묶이는 것을 막는다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: ["/go/", "/api/", "/admin"] }],
  };
}

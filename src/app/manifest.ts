import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 - 폰 홈 화면에 "앱처럼" 설치용.
 * 설치 후 실행하면 관리자 페이지(/admin)로 바로 열린다
 * (로그인 쿠키는 30일 유지되니 매번 로그인할 필요 없음).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "살림템 메모장 관리자",
    short_name: "살림템",
    description: "살림템 메모장 - 영상 관리 · 스튜디오 · 수익 확인",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#FFF7EC",
    theme_color: "#FFF7EC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

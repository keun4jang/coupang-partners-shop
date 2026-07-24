import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "살림템 메모장",
  description:
    "아이 둘 키우며 눈에 띈 생활템을 번호로 정리해두는 곳이에요. 영상에서 본 번호를 검색해보세요.",
  // 폰 홈 화면 설치(PWA)용 - 아이폰 사파리는 매니페스트 대신 이 메타를 본다
  appleWebApp: {
    capable: true,
    title: "살림템",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFF7EC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-cream text-ink min-h-screen">
        {children}
      </body>
    </html>
  );
}

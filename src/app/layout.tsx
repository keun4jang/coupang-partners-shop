import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "살림템 메모장",
  description:
    "아이 둘 키우며 눈에 띈 생활템을 번호로 정리해두는 곳이에요. 영상에서 본 번호를 검색해보세요.",
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

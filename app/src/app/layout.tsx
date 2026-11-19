import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "풀이봄",
  description: "학생의 수학 풀이를 분석해 교사의 맞춤 지도를 돕는 AI 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

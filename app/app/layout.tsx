import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "풀이봄",
  description: "학생의 수학 풀이를 분석해 교사의 맞춤 지도를 돕는 AI 서비스",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-sun text-base">🐥</span>
              풀이봄
            </Link>
            <nav className="flex gap-4 text-sm text-ink-soft">
              <Link href="/student" className="hover:text-ink">학생</Link>
              <Link href="/teacher" className="hover:text-ink">교사</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

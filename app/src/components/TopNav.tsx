"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Chick from "./Chick";
import LogoutButton from "./LogoutButton";
import TeacherInbox from "./TeacherInbox";

// 역할별 메뉴: 학생은 가운데 탭, 교사는 탭 없이 오른쪽에 과제 출제 버튼과 이름(→설정).
const TABS = {
  teacher: [],
  student: [{ href: "/student", label: "과제 풀어보기" }],
} as const;

export type Role = keyof typeof TABS;

export default function TopNav({ role, userName }: { role?: Role; userName?: string }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/teacher" ? path === "/teacher" || path.startsWith("/teacher/students") : path === href;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-1.5 text-lg font-extrabold">
          <Chick size={28} />
          풀이봄<span className="text-honey-deep">.</span>
        </Link>
        {role && TABS[role].length > 0 && (
          <div className="mx-auto hidden items-center gap-1 sm:flex">
            {TABS[role].map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  isActive(t.href) ? "bg-honey-soft font-semibold text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}
        {userName ? (
          <div className={`ml-auto flex items-center gap-2 ${role === "student" ? "sm:ml-0" : ""}`}>
            {role === "teacher" && (
              <>
                <Link
                  href="/teacher/assign"
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold text-ink ${path.startsWith("/teacher/assign") ? "bg-honey" : "bg-honey-soft hover:bg-honey"}`}
                >
                  과제 출제
                </Link>
                <TeacherInbox />
              </>
            )}
            {role === "teacher" ? (
              <>
                <Link
                  href="/teacher/settings"
                  title="설정"
                  className={`hidden text-xs hover:text-ink sm:inline ${path.startsWith("/teacher/settings") ? "font-semibold text-ink" : "text-muted"}`}
                >
                  {userName}
                </Link>
                <Link href="/teacher/settings" title="설정" className="grid h-8 w-8 place-items-center rounded-full bg-sand text-sm font-semibold hover:bg-honey-soft">
                  {userName[0]}
                </Link>
              </>
            ) : (
              <>
                <span className="hidden text-xs text-muted sm:inline">{userName}</span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-sand text-sm font-semibold">{userName[0]}</span>
              </>
            )}
            <LogoutButton />
          </div>
        ) : (
          <Link href="/login" className="ml-auto rounded-full bg-honey-soft px-4 py-1.5 text-sm font-semibold">
            로그인
          </Link>
        )}
      </nav>
    </header>
  );
}

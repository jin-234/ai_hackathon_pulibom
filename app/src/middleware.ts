import { NextResponse, type NextRequest } from "next/server";
import { isAppUA } from "@/lib/app";
import { decodeSession, HOME_OF, SESSION_COOKIE, type Role } from "@/lib/auth";

// 교사 화면은 교사만, 학생 화면은 학생만 들어갈 수 있게 막는다
const GUARDED: { prefix: string; role: Role }[] = [
  { prefix: "/teacher", role: "teacher" },
  { prefix: "/student", role: "student" },
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);

  // 학생용 아이패드 앱: 첫 화면·교사 화면 대신 학생 화면으로
  if (isAppUA(req.headers.get("user-agent")) && (pathname === "/" || pathname.startsWith("/teacher"))) {
    return NextResponse.redirect(new URL(session?.role === "student" ? "/student" : "/login?role=student", req.url));
  }

  const guard = GUARDED.find((g) => pathname.startsWith(g.prefix));
  if (!guard) return NextResponse.next();
  if (session?.role === guard.role) return NextResponse.next();

  // 다른 역할로 로그인돼 있으면 자기 화면으로, 아니면 로그인으로
  if (session) return NextResponse.redirect(new URL(HOME_OF[session.role], req.url));
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/", "/teacher/:path*", "/student/:path*"] };

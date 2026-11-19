import { NextResponse } from "next/server";
import { encodeSession, HOME_OF, SESSION_COOKIE } from "@/lib/auth";
import { classByCode, signupStudent, validateSignup } from "@/lib/signup";

export const runtime = "nodejs";

// 반 코드 확인: 가입 전에 어느 반인지 보여 준다 (?code=ABC123)
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  try {
    const cls = await classByCode(code);
    if (!cls) return NextResponse.json({ error: "반 코드를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ className: `${cls.schoolYear}학년도 ${cls.name}` });
  } catch {
    return NextResponse.json({ error: "반 코드를 확인하지 못했어요." }, { status: 503 });
  }
}

// 학생 회원가입 { code, number, name, password } → 계정 + 그 반 학생으로 바로 들어가고 로그인까지
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const { session, className } = await signupStudent(validateSignup(body));
    const res = NextResponse.json({ ok: true, home: HOME_OF.student, className, session });
    res.cookies.set(SESSION_COOKIE, encodeSession(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

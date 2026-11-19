import { NextResponse } from "next/server";
import { encodeSession, HOME_OF, SESSION_COOKIE, type Role } from "@/lib/auth";
import { checkLogin, demoSession } from "@/lib/roster";

export async function POST(req: Request) {
  const body = (await req.json()) as { role: Role; id?: string; password?: string; skip?: boolean };
  if (body.role !== "teacher" && body.role !== "student") {
    return NextResponse.json({ error: "역할을 선택해 주세요." }, { status: 400 });
  }
  let session;
  try {
    session = body.skip ? await demoSession(body.role) : await checkLogin(body.role, body.id ?? "", body.password ?? "");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: "아이디 또는 비밀번호를 확인해 주세요." }, { status: 401 });

  const res = NextResponse.json({ ok: true, home: HOME_OF[session.role], session });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}

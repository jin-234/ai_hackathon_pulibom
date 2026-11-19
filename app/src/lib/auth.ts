// ⚠️ 프로토타입용 로그인: 쿠키에 역할만 담는다. 계정 확인은 roster.ts (DB). 실제 서비스에서는 학교 계정 연동·비밀번호 해시·서명된 세션으로 바꿔야 한다.

export type Role = "teacher" | "student";
export type Session = { role: Role; id: string; name: string; demo?: boolean };

export const SESSION_COOKIE = "pulibom_session";

export const DEMO_TEACHER = { id: "teacher", password: "1234", name: "김선생님", className: "1학년 3반" };
export const DEMO_STUDENT_PASSWORD = "0000";

export function encodeSession(s: Session) {
  return encodeURIComponent(JSON.stringify(s));
}

export function decodeSession(v: string | undefined): Session | null {
  if (!v) return null;
  try {
    const s = JSON.parse(decodeURIComponent(v)) as Session;
    return s.role === "teacher" || s.role === "student" ? s : null;
  } catch {
    return null;
  }
}

export const HOME_OF: Record<Role, string> = { teacher: "/teacher", student: "/student" };

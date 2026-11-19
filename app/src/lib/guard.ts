import { NextResponse } from "next/server";
import { getAssignment } from "./assignments";
import { studentAccess, teacherClass } from "./classes";
import { getSession } from "./session";

// API 권한 확인 공통 함수. 실패하면 { error: 응답 } 을 돌려준다
const fail = (status: number, error: string) => ({ error: NextResponse.json({ error }, { status }) });

export async function requireTeacher() {
  const session = await getSession();
  return session?.role === "teacher" ? { session } : fail(401, "선생님으로 로그인해 주세요.");
}

// 내 반 과제인지 (보관된 반 과제는 고칠 수 없음)
export async function requireOwnAssignment(assignmentId: string, opts: { write: boolean }) {
  const t = await requireTeacher();
  if ("error" in t) return t;
  const assignment = await getAssignment(assignmentId);
  if (!assignment) return fail(404, "과제를 찾을 수 없어요.");
  const cls = await teacherClass(t.session.id, assignment.classId);
  if (!cls) return fail(403, "담당 반의 과제가 아니에요.");
  if (opts.write && cls.archived) return fail(403, "보관된 반의 과제는 고칠 수 없어요.");
  return { session: t.session, assignment, cls };
}

// 학생 기록 열람 권한. current 를 요구하면 지금 내 반 학생만 (요약·보충 지도)
export async function requireStudentAccess(studentId: string, opts: { current: boolean }) {
  const t = await requireTeacher();
  if ("error" in t) return t;
  const access = await studentAccess(t.session.id, studentId);
  if (access.level === "none") return fail(403, "담당 반 학생이 아니에요.");
  if (opts.current && access.level !== "current") return fail(403, "지금 담당 반 학생에게만 할 수 있어요.");
  return { session: t.session, access };
}

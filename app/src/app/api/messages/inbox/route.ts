import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/guard";
import { teacherInbox, teacherStudents } from "@/lib/messages";

export const runtime = "nodejs";

// 선생님: 학생별 대화 목록 + 안 읽은 수 (상단 알림용) + 먼저 보낼 수 있는 담당 반 학생 (새 메시지)
export async function GET() {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  const [inbox, students] = await Promise.all([teacherInbox(t.session.id), teacherStudents(t.session.id)]);
  return NextResponse.json({ inbox, students });
}

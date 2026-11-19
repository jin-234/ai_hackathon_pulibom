import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/guard";
import { teacherInbox } from "@/lib/messages";

export const runtime = "nodejs";

// 선생님: 학생별 대화 목록 + 안 읽은 수 (상단 알림용)
export async function GET() {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  return NextResponse.json({ inbox: await teacherInbox(t.session.id) });
}

import { NextResponse } from "next/server";
import { classLabel, setClassArchived, teacherClass } from "@/lib/classes";
import { requireTeacher } from "@/lib/guard";

export const runtime = "nodejs";

// 반 보관 / 보관 해제 { archived: boolean }
//   보관하면 학생 화면에서 그 반 과제가 사라지고, 교사 화면에서는 읽기 전용 '지난 반'이 된다 (데이터는 지우지 않음)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  const { id } = await params;
  const cls = await teacherClass(t.session.id, id);
  if (!cls) return NextResponse.json({ error: "담당 반이 아니에요." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { archived?: unknown };
  if (typeof body.archived !== "boolean") return NextResponse.json({ error: "archived 값을 보내 주세요." }, { status: 400 });
  await setClassArchived(id, body.archived);
  const next = { ...cls, archived: body.archived };
  return NextResponse.json({ ...next, label: classLabel(next) });
}

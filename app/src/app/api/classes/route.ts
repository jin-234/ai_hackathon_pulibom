import { NextResponse } from "next/server";
import { classLabel, teacherClasses } from "@/lib/classes";
import { requireTeacher } from "@/lib/guard";

export const runtime = "nodejs";

// 내가 담당하는 반 (올해 반 먼저, 보관된 지난 반은 뒤에)
export async function GET() {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  try {
    const list = await teacherClasses(t.session.id);
    return NextResponse.json(list.map((c) => ({ ...c, label: classLabel(c) })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

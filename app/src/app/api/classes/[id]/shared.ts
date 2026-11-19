import { NextResponse } from "next/server";
import { teacherClass } from "@/lib/classes";
import { requireTeacher } from "@/lib/guard";

// 내 담당 반인지 (write: 보관된 반은 고칠 수 없음)
export async function requireOwnClass(id: string, opts: { write: boolean }) {
  const t = await requireTeacher();
  if ("error" in t) return t;
  const cls = await teacherClass(t.session.id, id);
  if (!cls) return { error: NextResponse.json({ error: "담당 반이 아니에요." }, { status: 403 }) };
  if (opts.write && cls.archived) return { error: NextResponse.json({ error: "보관된 반은 고칠 수 없어요." }, { status: 403 }) };
  return { cls };
}

import { NextResponse } from "next/server";
import { requireStudentAccess } from "@/lib/guard";
import { listMessages, markRead, sendMessage } from "@/lib/messages";

export const runtime = "nodejs";

// 선생님: 학생과의 대화. 읽기는 지난 학년 학생도, 보내기는 지금 담당 반 학생에게만
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: false });
  if ("error" in g) return g.error;
  if (g.access.level === "current") await markRead(id, "teacher");
  return NextResponse.json({ messages: await listMessages(id), canSend: g.access.level === "current" });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  try {
    return NextResponse.json({ message: await sendMessage(id, { sender: "teacher", id: g.session.id, name: g.session.name }, body ?? "") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireStudentAccess } from "@/lib/guard";
import { listMessages, markRead, saveMessageFile, sendMessage, type Attachment } from "@/lib/messages";

export const runtime = "nodejs";

// 선생님: 학생과의 대화. 읽기는 지난 학년 학생도, 보내기는 지금 담당 반 학생에게만
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: false });
  if ("error" in g) return g.error;
  if (g.access.level === "current") await markRead(id, "teacher");
  return NextResponse.json({ messages: await listMessages(id), canSend: g.access.level === "current" });
}

// 보내기: JSON { body } 또는 파일을 붙이면 form-data (body, file). 본문의 유튜브·웹 주소는 링크로 붙는다
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  try {
    let body = "";
    const files: Attachment[] = [];
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData().catch(() => {
        throw new Error("파일을 받지 못했어요. 4MB 이하 파일인지 확인해 주세요.");
      });
      body = String(form.get("body") ?? "");
      const file = form.get("file");
      if (file instanceof File && file.size > 0) files.push(await saveMessageFile(id, file));
    } else body = ((await req.json().catch(() => ({}))) as { body?: string }).body ?? "";
    return NextResponse.json({ message: await sendMessage(id, { sender: "teacher", id: g.session.id, name: g.session.name }, body, files) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

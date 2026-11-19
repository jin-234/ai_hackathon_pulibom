import { NextResponse } from "next/server";
import { listMessages, markRead, sendMessage, studentUnread } from "@/lib/messages";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// 학생: 내 대화방 (선생님과)
async function requireStudent() {
  const session = await getSession();
  if (session?.role !== "student" || session.demo) return null;
  return session;
}

// ?unread=1 이면 안 읽은 수만 (상단 배지용), 아니면 대화를 열어 선생님 메시지를 읽음으로
export async function GET(req: Request) {
  const s = await requireStudent();
  if (!s) return NextResponse.json({ error: "학생으로 로그인해 주세요." }, { status: 401 });
  if (new URL(req.url).searchParams.get("unread")) return NextResponse.json({ unread: await studentUnread(s.id) });
  await markRead(s.id, "student");
  return NextResponse.json({ messages: await listMessages(s.id), unread: 0 });
}

export async function POST(req: Request) {
  const s = await requireStudent();
  if (!s) return NextResponse.json({ error: "학생으로 로그인해 주세요." }, { status: 401 });
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  try {
    return NextResponse.json({ message: await sendMessage(s.id, { sender: "student", id: s.id, name: s.name }, body ?? "") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

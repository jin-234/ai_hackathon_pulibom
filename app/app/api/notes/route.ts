import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// 교사 관찰 메모
export async function POST(req: Request) {
  const { studentId, body } = (await req.json()) as { studentId: string; body: string };
  if (!studentId || !body?.trim()) return NextResponse.json({ error: "내용을 입력하세요" }, { status: 400 });
  const { error } = await db().from("teacher_notes").insert({ student_id: studentId, body: body.trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

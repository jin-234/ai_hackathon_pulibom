import { NextResponse } from "next/server";
import { ERROR_TYPES, isConcept } from "@/lib/constants";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// 교사 확인: 오류 유형 수정, 메모, 확인 완료
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { teacher_error_type?: string | null; teacher_note?: string; reviewed?: boolean };

  const patch: Record<string, unknown> = {};
  if (body.teacher_error_type !== undefined) {
    const t = body.teacher_error_type;
    if (t !== null && !(ERROR_TYPES as readonly string[]).includes(t)) {
      return NextResponse.json({ error: "잘못된 오류 유형" }, { status: 400 });
    }
    patch.teacher_error_type = t;
    if (t !== null) patch.concept = isConcept(t) ? t : null;
  }
  if (body.teacher_note !== undefined) patch.teacher_note = body.teacher_note;
  if (body.reviewed !== undefined) {
    patch.reviewed = body.reviewed;
    if (body.reviewed) patch.status = "done";
  }

  const { error } = await db().from("submissions").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

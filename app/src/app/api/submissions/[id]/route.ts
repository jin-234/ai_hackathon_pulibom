import { NextResponse } from "next/server";
import { canEditSubmission, canSeeSubmission } from "@/lib/classes";
import { requireStudentAccess } from "@/lib/guard";
import { getSubmission, updateSubmission } from "@/lib/store";
import type { ErrorType } from "@/lib/types";

export const runtime = "nodejs";

// 풀이 하나 (교사 화면)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) return NextResponse.json({ error: "없음" }, { status: 404 });
  const g = await requireStudentAccess(s.studentId, { current: false });
  if ("error" in g) return g.error;
  if (!canSeeSubmission(g.access, s)) return NextResponse.json({ error: "볼 수 없는 기록이에요." }, { status: 403 });
  const { ocrRaw: _r, ...rest } = s;
  return NextResponse.json({ ...rest, readOnly: !canEditSubmission(g.access, s) });
}

// 교사 확인·수정: 오류 유형 수정, 관찰 메모 (지난 학년·보관된 반 기록은 읽기 전용)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) return NextResponse.json({ error: "없음" }, { status: 404 });
  const g = await requireStudentAccess(s.studentId, { current: false });
  if ("error" in g) return g.error;
  if (!canEditSubmission(g.access, s)) return NextResponse.json({ error: "지난 학년 기록은 고칠 수 없어요." }, { status: 403 });
  const body = (await req.json()) as { errorType?: ErrorType; memo?: string };
  const next = await updateSubmission(id, {
    teacher: {
      ...s.teacher,
      ...(body.errorType !== undefined ? { errorType: body.errorType } : {}),
      ...(body.memo !== undefined ? { memo: body.memo } : {}),
      confirmedAt: Date.now(),
      by: g.session.id,
    },
  });
  return NextResponse.json({ ...next, readOnly: false });
}

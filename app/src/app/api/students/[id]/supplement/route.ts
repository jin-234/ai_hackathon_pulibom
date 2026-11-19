import { NextResponse } from "next/server";
import { createAssignment } from "@/lib/assignments";
import { buildProblems, type QuestionInput } from "@/lib/buildProblems";
import { requireStudentAccess } from "@/lib/guard";
import { supplementProgress } from "@/lib/supplement";
import type { ErrorType } from "@/lib/types";

export const runtime = "nodejs";

// 보충 지도는 지금 담당 반 학생에게만

// 이 학생의 보충 과제 기록 (보충 전 → 후)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  return NextResponse.json(await supplementProgress(id));
}

// 이 학생에게만 보충 과제 배정
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  const body = (await req.json()) as {
    title?: string;
    questions?: QuestionInput[];
    dueAt?: number | null;
    concept?: string;
    targetError?: ErrorType | null;
    sourceSubmissionIds?: string[];
  };
  try {
    if (typeof body.dueAt === "number" && body.dueAt <= Date.now()) throw new Error("마감 예약은 지금보다 뒤의 시간으로 정해 주세요.");
    const problems = buildProblems(body.questions ?? []);
    const a = await createAssignment(body.title?.trim() || `보충 · ${body.concept ?? "일차방정식"}`, problems, {
      classId: g.access.currentClassIds[0], // 학생이 지금 속한 내 반
      publish: true,
      dueAt: typeof body.dueAt === "number" ? body.dueAt : undefined,
      studentIds: [id],
      supplement: {
        studentId: id,
        concept: body.concept ?? problems[0].concept,
        targetError: body.targetError ?? null,
        sourceSubmissionIds: body.sourceSubmissionIds ?? [],
      },
    });
    return NextResponse.json(a);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

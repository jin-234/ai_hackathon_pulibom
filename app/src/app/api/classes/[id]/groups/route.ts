import { NextResponse } from "next/server";
import { createAssignment } from "@/lib/assignments";
import { buildProblems, type QuestionInput } from "@/lib/buildProblems";
import { asErrorType, requireGroup } from "./shared";

export const runtime = "nodejs";

// 소그룹에 보충 과제 한 번에 배정 (결과·변화 분석은 학생마다 따로 쌓인다)
// body: { studentIds, group, title, concept, targetError, sourceSubmissionIds, questions, dueAt }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    studentIds?: unknown;
    group?: string;
    title?: string;
    concept?: string;
    targetError?: unknown;
    sourceSubmissionIds?: unknown;
    questions?: QuestionInput[];
    dueAt?: number | null;
  };
  const g = await requireGroup(id, body.studentIds);
  if ("error" in g) return g.error;
  try {
    if (typeof body.dueAt === "number" && body.dueAt <= Date.now()) throw new Error("마감 예약은 지금보다 뒤의 시간으로 정해 주세요.");
    const problems = buildProblems(body.questions ?? []);
    const concept = body.concept?.trim() || problems[0].concept;
    const a = await createAssignment(body.title?.trim() || `보충 · ${concept}`, problems, {
      classId: g.cls.id,
      publish: true,
      dueAt: typeof body.dueAt === "number" ? body.dueAt : undefined,
      studentIds: g.studentIds,
      supplement: {
        studentIds: g.studentIds,
        group: body.group?.trim() || concept,
        concept,
        targetError: asErrorType(body.targetError),
        sourceSubmissionIds: Array.isArray(body.sourceSubmissionIds) ? body.sourceSubmissionIds.filter((x): x is string => typeof x === "string") : [],
      },
    });
    return NextResponse.json(a);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

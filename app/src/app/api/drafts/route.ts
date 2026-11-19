import { NextResponse } from "next/server";
import { findProblemWithAssignment, studentCanSee } from "@/lib/assignments";
import { studentCurrentClassIds } from "@/lib/classes";
import { saveDraft } from "@/lib/drafts";
import { getSession } from "@/lib/session";
import { statusOf, type Stroke } from "@/lib/types";

export const runtime = "nodejs";

const MAX_STROKES = 3000;

// 풀던 중인 풀이 자동 저장 (학생 본인, 열려 있는 과제만). 둘러보기(데모) 계정은 저장하지 않는다
export async function PUT(req: Request) {
  const session = await getSession();
  if (session?.role !== "student") return NextResponse.json({ error: "학생으로 로그인해 주세요." }, { status: 401 });
  if (session.demo) return NextResponse.json({ ok: true, skipped: true });
  const body = (await req.json().catch(() => null)) as { problemId?: string; strokes?: Stroke[]; scratch?: Stroke[]; answer?: string } | null;
  if (!body?.problemId) return NextResponse.json({ error: "문항이 없어요." }, { status: 400 });
  const found = await findProblemWithAssignment(body.problemId);
  if (!found) return NextResponse.json({ error: "알 수 없는 문항" }, { status: 400 });
  const { assignment } = found;
  if (assignment) {
    if (!studentCanSee(assignment, session.id, await studentCurrentClassIds(session.id)))
      return NextResponse.json({ error: "배정되지 않은 과제예요." }, { status: 403 });
    const st = statusOf(assignment);
    if (st === "closed" || st === "draft") return NextResponse.json({ error: "지금은 풀 수 없는 과제예요." }, { status: 403 });
  }
  const strokes = Array.isArray(body.strokes) ? body.strokes.slice(0, MAX_STROKES) : undefined;
  const scratch = Array.isArray(body.scratch) ? body.scratch.slice(0, MAX_STROKES) : undefined;
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 100) : undefined;
  await saveDraft(session.id, body.problemId, { strokes, scratch, answer });
  return NextResponse.json({ ok: true });
}

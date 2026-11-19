import { NextResponse } from "next/server";
import { countAssignmentSubmissions, deleteAssignment, setProblemAnswer, updateAssignment } from "@/lib/assignments";
import { requireOwnAssignment } from "@/lib/guard";
import { formatOf, pickChoices, splitChoices } from "@/lib/problemFormat";

export const runtime = "nodejs";

// 과제 수정
//   { title }           이름 바꾸기
//   { published }       학생에게 공개 / 비공개
//   { closed }          지금 마감 / 다시 열기
//   { dueAt }           마감 예약 (ms), null 이면 예약 해제
//   { answer: { problemId, answer } }  문항 정답 고치기 (빈 값이면 정답 없음)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnAssignment(id, { write: true });
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    published?: boolean;
    closed?: boolean;
    dueAt?: number | null;
    answer?: { problemId?: string; answer?: string };
  };
  if (body.answer) {
    const { problemId, answer } = body.answer;
    if (typeof problemId !== "string" || typeof answer !== "string" || answer.length > 200)
      return NextResponse.json({ error: "정답을 확인해 주세요." }, { status: 400 });
    // 객관식 문항은 보기 안에서만 정답으로 ("③" · "②, ④" 만 보내도 "③ 보기 내용" · "② …, ④ …" 로 저장)
    const problem = g.assignment.problems.find((p) => p.id === problemId);
    let value = answer.trim();
    if (problem && formatOf(problem) === "choice" && value) {
      const picked = pickChoices(value, splitChoices(problem.question).choices);
      if (!picked) return NextResponse.json({ error: "객관식 정답은 보기 중에서 골라 주세요." }, { status: 400 });
      value = picked;
    }
    if (!(await setProblemAnswer(id, problemId, value))) return NextResponse.json({ error: "이 과제의 문항이 아니에요." }, { status: 404 });
  }
  if (body.title !== undefined && !body.title.trim()) return NextResponse.json({ error: "과제 이름을 입력해 주세요." }, { status: 400 });
  if (typeof body.dueAt === "number" && body.dueAt <= Date.now())
    return NextResponse.json({ error: "마감 예약은 지금보다 뒤의 시간으로 정해 주세요." }, { status: 400 });
  const { title, published, closed, dueAt } = body;
  const next = await updateAssignment(id, { title: title?.trim(), published, closed, dueAt });
  return next ? NextResponse.json(next) : NextResponse.json({ error: "없음" }, { status: 404 });
}

// 삭제 전 확인: 함께 지워질 학생 풀이 수
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnAssignment(id, { write: true });
  if ("error" in g) return g.error;
  return NextResponse.json({ submissions: await countAssignmentSubmissions(id) });
}

// 과제 삭제: 문항과 그 문항으로 낸 학생 풀이까지 함께 지운다 (되돌릴 수 없음)
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnAssignment(id, { write: true });
  if ("error" in g) return g.error;
  return (await deleteAssignment(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "반의 마지막 과제는 지울 수 없어요." }, { status: 400 });
}

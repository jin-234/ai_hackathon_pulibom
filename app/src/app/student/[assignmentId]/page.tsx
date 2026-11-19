import { notFound, redirect } from "next/navigation";
import StudentApp, { type MyResult } from "@/components/StudentApp";
import { getAssignment, studentCanSee } from "@/lib/assignments";
import { studentCurrentClassIds } from "@/lib/classes";
import { getSession } from "@/lib/session";
import { listDrafts, type Draft } from "@/lib/drafts";
import { latestAnswers, latestScratch, latestStrokes, listSubmissions } from "@/lib/store";
import { statusOf, type Stroke } from "@/lib/types";

export const dynamic = "force-dynamic";

// 과제 이름을 문서 제목으로 (아이패드 앱 상단 바가 이걸 읽어 가운데에 보여 준다)
export async function generateMetadata({ params }: { params: Promise<{ assignmentId: string }> }) {
  const a = await getAssignment((await params).assignmentId);
  return { title: a?.title ?? "풀이봄" };
}

export default async function SolvePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await getSession();
  if (session?.role !== "student") redirect("/login?role=student");
  const { assignmentId } = await params;
  const assignment = await getAssignment(assignmentId);
  // 지금 속한 반의 과제만 (보관된 지난 반 과제는 열리지 않음)
  if (!assignment || !studentCanSee(assignment, session.id, await studentCurrentClassIds(session.id))) notFound();
  const st = statusOf(assignment);
  if (st === "draft") redirect("/student");
  const subs = await listSubmissions({ studentId: session.id });
  const mine = subs
    .filter((s) => s.studentId === session.id && assignment.problems.some((p) => p.id === s.problemId))
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const done = Object.fromEntries(mine.map((s) => [s.problemId, true]));
  // 마감된 과제만: 문항별 마지막 제출의 AI 채점(틀린 줄·이유)·선생님 확인·메모, 정답·해설 (교사용 지도 방향(suggestion)은 빼고)
  const results: Record<string, MyResult> = {};
  if (st === "closed")
    for (const s of mine) {
      const p = assignment.problems.find((q) => q.id === s.problemId)!;
      results[s.problemId] = {
        submissionId: s.id,
        submittedAt: s.submittedAt,
        tries: mine.filter((x) => x.problemId === s.problemId).length,
        status: s.status,
        ai: s.analysis
          ? {
              correct: s.analysis.correct,
              answer: s.analysis.recognizedAnswer,
              errorType: s.analysis.errorType,
              reason: s.analysis.reason,
              // 내 풀이를 AI가 읽은 줄 (보정한 줄 우선)과 처음 틀린 줄
              lines: s.analysis.correctedLines?.length ? s.analysis.correctedLines : s.ocrLines,
              firstErrorLine: s.analysis.firstErrorLine,
            }
          : null,
        teacher: s.teacher?.confirmedAt
          ? { errorType: s.teacher.errorType ?? null, confirmedAt: s.teacher.confirmedAt, memo: s.teacher.memo?.trim() || null }
          : null,
        answer: p.answer || null,
        answerText: s.answerText ?? null,
        answerCorrect: s.answerCorrect ?? null,
        hasScratch: Boolean(s.hasScratch),
        solution: p.solution ?? [],
      };
    }
  // 아직 열린 과제: 이미 낸 문항은 마지막 풀이를 캔버스에 그대로 띄워서 그 위에서 고친다
  const ids = assignment.problems.map((p) => p.id);
  const [strokes, answers, scratch, drafts]: [Record<string, Stroke[]>, Record<string, string>, Record<string, Stroke[]>, Record<string, Draft>] =
    st === "closed"
      ? [{}, {}, {}, {}]
      : await Promise.all([latestStrokes(session.id, ids), latestAnswers(session.id, ids), latestScratch(session.id, ids), listDrafts(session.id, ids)]);
  // 풀던 중 자동 저장된 게 있으면 그걸로 시작 (제출하면 지우므로 있으면 마지막 제출보다 새것)
  const draftAt: Record<string, number> = {};
  for (const [pid, d] of Object.entries(drafts)) {
    if (d.strokes) strokes[pid] = d.strokes;
    if (d.scratch) scratch[pid] = d.scratch;
    if (d.answer !== undefined) answers[pid] = d.answer;
    draftAt[pid] = d.updatedAt;
  }
  return (
    <StudentApp
      key={assignment.id}
      studentId={session.id}
      studentName={session.name}
      assignmentTitle={assignment.title}
      problems={assignment.problems}
      initialDone={done}
      initialStrokes={strokes}
      initialAnswers={answers}
      initialScratch={scratch}
      initialDraftAt={draftAt}
      closed={st === "closed"}
      results={st === "closed" ? results : undefined}
      dueAt={st === "closed" ? undefined : assignment.dueAt}
    />
  );
}

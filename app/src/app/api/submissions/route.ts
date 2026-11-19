import { after, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { findProblemWithAssignment, studentCanSee } from "@/lib/assignments";
import { canEditSubmission, canSeeSubmission, studentCurrentClassIds } from "@/lib/classes";
import { requireStudentAccess } from "@/lib/guard";
import { getStudent } from "@/lib/roster";
import { checkAnswer } from "@/lib/answerCheck";
import { deleteDraft } from "@/lib/drafts";
import { listSubmissions, saveSubmission } from "@/lib/store";
import { runPipeline } from "@/lib/pipeline";
import { getSession } from "@/lib/session";
import { statusOf, type InkEvent, type Stroke, type Submission } from "@/lib/types";

export const runtime = "nodejs";
// 응답 뒤 분석(OCR·다시 읽기·채점)이 끝날 때까지 함수를 살려 둔다 (Vercel)
export const maxDuration = 300;

// 학생 한 명의 풀이 기록 (교사 화면). ?studentId=
//  - 지금 내 반 학생: 지난 학년 기록까지 전부 (지난 기록은 readOnly)
//  - 예전에 내 반이었던 학생: 내 반 시절 기록만, 전부 readOnly
export async function GET(req: Request) {
  const studentId = new URL(req.url).searchParams.get("studentId") ?? "";
  const g = await requireStudentAccess(studentId, { current: false });
  if ("error" in g) return g.error;
  const [student, list] = await Promise.all([getStudent(studentId), listSubmissions({ studentId })]);
  return NextResponse.json({
    student: student ?? { id: studentId, name: studentId },
    access: g.access.level,
    // 이 학생의 반 (내 올해 반 우선, 없으면 예전 내 반): 학생 상세가 그 반 지표를 불러오게
    classId: g.access.currentClassIds[0] ?? g.access.myClassIds[0] ?? null,
    // 목록에서는 무거운 필드 제외
    submissions: list
      .filter((s) => canSeeSubmission(g.access, s))
      .map(({ strokes: _s, ocrRaw: _r, ...rest }) => ({ ...rest, readOnly: !canEditSubmission(g.access, rest) })),
  });
}

type Body = {
  problemId: string;
  startedAt: number;
  submittedAt: number;
  strokes: Stroke[];
  events: InkEvent[];
  imageDataUrl: string; // data:image/png;base64,...
  answerText?: string; // 답안 칸에 쓴 최종 답
  scratch?: { strokes: Stroke[]; imageDataUrl: string }; // 연습장 (AI 는 읽지 않고 선생님만 본다)
};

// 학생 풀이 제출 → 저장 → (백그라운드) OCR + 분석
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "student") return NextResponse.json({ error: "학생으로 로그인해 주세요." }, { status: 401 });
  const body = (await req.json()) as Body;
  const found = await findProblemWithAssignment(body.problemId);
  if (!found) return NextResponse.json({ error: "알 수 없는 문항" }, { status: 400 });
  const { problem, assignment } = found;
  if (assignment) {
    if (!studentCanSee(assignment, session.id, await studentCurrentClassIds(session.id)))
      return NextResponse.json({ error: "배정되지 않은 과제예요." }, { status: 403 });
    const st = statusOf(assignment);
    if (st === "closed") return NextResponse.json({ error: "마감된 과제예요. 더 이상 제출할 수 없어요." }, { status: 403 });
    if (st === "draft") return NextResponse.json({ error: "아직 공개되지 않은 과제예요." }, { status: 403 });
  }

  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  // 답안 칸 답은 바로 정답과 비교해 둔다
  const answerText = typeof body.answerText === "string" ? body.answerText.trim().slice(0, 100) : "";
  const png = Buffer.from(body.imageDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

  const submission: Submission = {
    id,
    studentId: session.id,
    problemId: body.problemId,
    question: problem.question,
    startedAt: body.startedAt,
    submittedAt: body.submittedAt,
    strokes: body.strokes,
    events: body.events,
    ocrLines: [],
    status: "pending",
    ...(answerText ? { answerText } : {}),
    answerCorrect: checkAnswer(answerText, problem.answer),
  };
  const scratch = body.scratch?.strokes?.length
    ? { strokes: body.scratch.strokes, png: Buffer.from(body.scratch.imageDataUrl.replace(/^data:image\/png;base64,/, ""), "base64") }
    : undefined;
  await saveSubmission(submission, png, scratch);
  await deleteDraft(session.id, body.problemId); // 냈으니 풀던 중 기록은 지운다

  // 응답은 바로 돌려주고 분석은 뒤에서 진행 (교사 화면에서 '분석 중' 표시).
  // after: 서버리스(Vercel)에서도 응답을 보낸 뒤 분석이 끝날 때까지 함수가 멈추지 않게
  after(() => runPipeline(submission, png));
  return NextResponse.json({ id });
}

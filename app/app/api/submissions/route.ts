import { NextResponse } from "next/server";
import { enqueueAnalysis } from "@/lib/analyze";
import { isCorrectAnswer } from "@/lib/answer";
import { BUCKET, db } from "@/lib/supabase";

export const runtime = "nodejs";

type PadEvent = { t: number; type: string };

// 학생 풀이 제출: 이미지 업로드 → 제출 기록 저장 → 백그라운드 분석 시작
export async function POST(req: Request) {
  const form = await req.formData();
  const image = form.get("image");
  const studentId = String(form.get("studentId") ?? "");
  const assignmentId = String(form.get("assignmentId") ?? "");
  const problemId = String(form.get("problemId") ?? "");
  const finalAnswer = String(form.get("finalAnswer") ?? "").trim();
  const startedAt = Number(form.get("startedAt"));
  const submittedAt = Date.now();

  if (!(image instanceof Blob) || !studentId || !assignmentId || !problemId) {
    return NextResponse.json({ error: "필수 값 누락" }, { status: 400 });
  }

  let events: PadEvent[] = [];
  try {
    events = JSON.parse(String(form.get("events") ?? "[]"));
  } catch {}

  const supabase = db();
  const { data: problem, error: pErr } = await supabase.from("problems").select("answer").eq("id", problemId).single();
  if (pErr || !problem) return NextResponse.json({ error: "문항 없음" }, { status: 404 });

  const imagePath = `${studentId}/${assignmentId}/${problemId}-${submittedAt}.png`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, Buffer.from(await image.arrayBuffer()), { contentType: "image/png" });
  if (upErr) return NextResponse.json({ error: `업로드 실패: ${upErr.message}` }, { status: 500 });

  // 화면 이탈 시간 합계
  let awayMs = 0;
  let hiddenAt: number | null = null;
  for (const e of events) {
    if (e.type === "hidden") hiddenAt = e.t;
    if (e.type === "visible" && hiddenAt !== null) {
      awayMs += e.t - hiddenAt;
      hiddenAt = null;
    }
  }

  const { data: row, error: insErr } = await supabase
    .from("submissions")
    .insert({
      student_id: studentId,
      assignment_id: assignmentId,
      problem_id: problemId,
      image_path: imagePath,
      final_answer: finalAnswer,
      is_correct: isCorrectAnswer(finalAnswer, problem.answer),
      started_at: Number.isFinite(startedAt) ? new Date(startedAt).toISOString() : null,
      submitted_at: new Date(submittedAt).toISOString(),
      duration_sec: Number.isFinite(startedAt) ? Math.round((submittedAt - startedAt) / 1000) : null,
      stroke_count: events.filter((e) => e.type === "stroke").length,
      erase_count: events.filter((e) => e.type === "erase" || e.type === "undo" || e.type === "clear").length,
      away_sec: Math.round(awayMs / 1000),
      events,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !row) return NextResponse.json({ error: `저장 실패: ${insErr?.message}` }, { status: 500 });

  enqueueAnalysis(row.id);
  return NextResponse.json({ id: row.id });
}

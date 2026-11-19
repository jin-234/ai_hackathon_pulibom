import { NextResponse } from "next/server";
import { CONCEPTS, isConcept } from "@/lib/constants";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// 보충 과제 배정: 같은 개념 문항 중 아직 안 푼 것 위주로 최대 3개
export async function POST(req: Request) {
  const { studentId, concept } = (await req.json()) as { studentId: string; concept: string };
  if (!studentId || !isConcept(concept)) return NextResponse.json({ error: "학생/개념 확인" }, { status: 400 });

  const supabase = db();
  const { data: student } = await supabase.from("students").select("class_id").eq("id", studentId).single();
  if (!student) return NextResponse.json({ error: "학생 없음" }, { status: 404 });

  const [{ data: problems }, { data: done }] = await Promise.all([
    supabase.from("problems").select("id, difficulty").eq("concept", concept).order("difficulty"),
    supabase.from("submissions").select("problem_id").eq("student_id", studentId),
  ]);
  const solved = new Set((done ?? []).map((d) => d.problem_id));
  const pool = problems ?? [];
  const picked = [...pool.filter((p) => !solved.has(p.id)), ...pool.filter((p) => solved.has(p.id))].slice(0, 3);
  if (!picked.length) return NextResponse.json({ error: "해당 개념 문항이 없습니다" }, { status: 404 });

  const { data: a, error } = await supabase
    .from("assignments")
    .insert({
      class_id: student.class_id,
      student_id: studentId,
      kind: "remedial",
      concept,
      title: `보충: ${CONCEPTS[concept].label}`,
    })
    .select("id")
    .single();
  if (error || !a) return NextResponse.json({ error: error?.message }, { status: 500 });

  await supabase
    .from("assignment_problems")
    .insert(picked.map((p, i) => ({ assignment_id: a.id, problem_id: p.id, position: i + 1 })));

  return NextResponse.json({ id: a.id, count: picked.length });
}

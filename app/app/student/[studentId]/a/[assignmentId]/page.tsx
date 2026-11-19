import { notFound } from "next/navigation";
import SolveClient from "@/components/SolveClient";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SolvePage({ params }: { params: Promise<{ studentId: string; assignmentId: string }> }) {
  const { studentId, assignmentId } = await params;
  const supabase = db();

  const [{ data: assignment }, { data: subs }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, assignment_problems(position, problem:problems(id, content))")
      .eq("id", assignmentId)
      .single(),
    supabase.from("submissions").select("problem_id").eq("student_id", studentId).eq("assignment_id", assignmentId),
  ]);
  if (!assignment) notFound();

  const problems = (
    assignment.assignment_problems as unknown as { position: number; problem: { id: string; content: string } }[]
  )
    .sort((a, b) => a.position - b.position)
    .map((ap) => ap.problem);

  return (
    <SolveClient
      studentId={studentId}
      assignmentId={assignment.id}
      title={assignment.title}
      problems={problems}
      submittedIds={(subs ?? []).map((s) => s.problem_id)}
    />
  );
}

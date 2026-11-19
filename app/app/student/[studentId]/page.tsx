import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function StudentHome({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const supabase = db();
  const { data: student } = await supabase.from("students").select("id, name, class_id").eq("id", studentId).single();
  if (!student) notFound();

  const [{ data: assignments }, { data: subs }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, kind, created_at, assignment_problems(problem_id)")
      .eq("class_id", student.class_id)
      .or(`student_id.is.null,student_id.eq.${studentId}`)
      .order("created_at", { ascending: false }),
    supabase.from("submissions").select("assignment_id, problem_id").eq("student_id", studentId),
  ]);

  const doneSet = new Set((subs ?? []).map((s) => `${s.assignment_id}:${s.problem_id}`));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">오늘도 한 뼘, 자라고 있어요 🌱</h1>
      <p className="mt-1 text-ink-soft">{student.name} 학생의 과제</p>

      <ul className="mt-6 space-y-3">
        {assignments?.map((a) => {
          const total = a.assignment_problems.length;
          const done = a.assignment_problems.filter((p) => doneSet.has(`${a.id}:${p.problem_id}`)).length;
          const finished = total > 0 && done === total;
          return (
            <li key={a.id}>
              <Link
                href={`/student/${studentId}/a/${a.id}`}
                className="card flex items-center justify-between gap-4 p-5 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {a.kind === "remedial" && <span className="chip bg-leaf-soft text-leaf">보충</span>}
                    <span className="font-semibold">{a.title}</span>
                  </div>
                  <div className="mt-1 text-sm text-ink-soft">
                    {done} / {total} 문항
                  </div>
                </div>
                <span className={finished ? "chip bg-leaf-soft text-leaf" : "btn-primary"}>
                  {finished ? "완료" : done ? "이어 풀기" : "풀기"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

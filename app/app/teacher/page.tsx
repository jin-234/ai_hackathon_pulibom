import AutoRefresh from "@/components/AutoRefresh";
import ClassTable from "@/components/ClassTable";
import { db } from "@/lib/supabase";
import type { SubLite } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function TeacherDashboard() {
  const supabase = db();
  const { data: cls, error } = await supabase.from("classes").select("id, name").order("id").limit(1).single();
  if (error || !cls) return <main className="p-8 text-alert">학급 데이터가 없습니다. supabase/seed.sql 을 실행하세요.</main>;

  const [{ data: students }, { data: assignments }, { data: problems }, { data: subs }] = await Promise.all([
    supabase.from("students").select("id, name, number").eq("class_id", cls.id).order("number"),
    supabase
      .from("assignments")
      .select("id, title, kind, assignment_problems(problem_id)")
      .eq("class_id", cls.id)
      .eq("kind", "regular")
      .order("created_at"),
    supabase.from("problems").select("id, concept"),
    supabase
      .from("submissions")
      .select(
        "id, student_id, assignment_id, problem_id, is_correct, duration_sec, status, error_type, teacher_error_type, concept, is_demo, created_at",
      ),
  ]);

  const analyzing = (subs ?? []).filter((s) => s.status === "pending" || s.status === "processing").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AutoRefresh active={analyzing > 0} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-soft">{cls.name}</p>
          <h1 className="text-2xl font-bold">학급 데이터 모아보기</h1>
        </div>
        {analyzing > 0 && <span className="chip bg-warn-soft text-ink">🔄 AI 분석 중 {analyzing}건</span>}
      </div>

      <ClassTable
        students={students ?? []}
        assignments={(assignments ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          problemIds: a.assignment_problems.map((p) => p.problem_id),
        }))}
        problemConcept={Object.fromEntries((problems ?? []).map((p) => [p.id, p.concept]))}
        subs={(subs ?? []) as SubLite[]}
      />
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { NoteForm, RemedialButton } from "@/components/TeacherActions";
import SubmissionCard, { type SubmissionView } from "@/components/SubmissionCard";
import { CONCEPT_KEYS, conceptLabel, errorLabel, isConcept } from "@/lib/constants";
import { db, signedImageUrl } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function StudentDetail({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const supabase = db();
  const { data: student } = await supabase.from("students").select("id, name, number").eq("id", studentId).single();
  if (!student) notFound();

  const [{ data: subs }, { data: notes }] = await Promise.all([
    supabase
      .from("submissions")
      .select("*, problem:problems(content, answer, concept), assignment:assignments(title, kind)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase.from("teacher_notes").select("id, body, created_at").eq("student_id", studentId).order("created_at", { ascending: false }),
  ]);

  const views: SubmissionView[] = await Promise.all(
    (subs ?? []).map(async (s) => ({ ...s, imageUrl: await signedImageUrl(s.image_path) }) as SubmissionView),
  );

  // 개념별 오류 집계
  const errCount = new Map<string, number>();
  for (const s of views) {
    const e = s.teacher_error_type ?? s.error_type;
    if (isConcept(e)) errCount.set(e, (errCount.get(e) ?? 0) + 1);
  }
  const graded = views.filter((s) => s.is_correct !== null);
  const acc = graded.length ? Math.round((graded.filter((s) => s.is_correct).length / graded.length) * 100) : null;
  const analyzing = views.some((s) => s.status === "pending" || s.status === "processing");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AutoRefresh active={analyzing} />
      <Link href="/teacher" className="text-sm text-ink-soft hover:text-ink">
        ← 학급 대시보드
      </Link>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <h1 className="text-2xl font-bold">
          {student.number}. {student.name}
        </h1>
        <span className="text-ink-soft">
          제출 {views.length}건 · 정답률 {acc == null ? "-" : `${acc}%`}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card p-5">
          <h2 className="font-semibold">개념별 오류</h2>
          <div className="mt-3 space-y-2">
            {CONCEPT_KEYS.map((k) => {
              const c = errCount.get(k) ?? 0;
              return (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0">{conceptLabel(k)}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className={`h-full rounded-full ${c >= 2 ? "bg-alert" : "bg-sun-deep"}`}
                      style={{ width: `${Math.min(100, c * 25)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-ink-soft">
                    {c ? `${errorLabel(k)} ${c}` : "-"}
                  </span>
                  {c > 0 ? <RemedialButton studentId={studentId} concept={k} /> : <span className="w-[88px]" />}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">관찰 메모</h2>
          <NoteForm studentId={studentId} />
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
            {notes?.map((n) => (
              <li key={n.id} className="rounded-xl bg-paper p-3">
                <div className="text-xs text-ink-soft">{new Date(n.created_at).toLocaleString("ko-KR")}</div>
                <div className="mt-1 whitespace-pre-wrap">{n.body}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h2 className="mt-8 text-lg font-bold">풀이 기록</h2>
      <div className="mt-3 space-y-4">
        {views.map((s) => (
          <SubmissionCard key={s.id} s={s} />
        ))}
        {!views.length && <p className="text-ink-soft">아직 제출한 풀이가 없습니다.</p>}
      </div>
    </main>
  );
}

// 교사 대시보드 집계 (클라이언트·서버 공용 순수 함수)
import { isConcept } from "./constants";

export type SubLite = {
  id: string;
  student_id: string;
  assignment_id: string;
  problem_id: string;
  is_correct: boolean | null;
  duration_sec: number | null;
  status: string;
  error_type: string | null;
  teacher_error_type: string | null;
  concept: string | null;
  is_demo: boolean;
  created_at: string;
};

export type StudentLite = { id: string; name: string; number: number };

export type StudentRow = StudentLite & {
  submitted: number;
  total: number;
  accuracy: number | null;
  avgSec: number | null;
  weakConcept: string | null;
  repeatErrors: { type: string; count: number }[];
  trend: "up" | "down" | "flat" | null;
  needsReview: number;
  analyzing: number;
  hasDemo: boolean;
};

export const effectiveError = (s: SubLite) => s.teacher_error_type ?? s.error_type;

export function buildRows(students: StudentLite[], subs: SubLite[], totalProblems: number): StudentRow[] {
  return students.map((st) => {
    const mine = subs
      .filter((s) => s.student_id === st.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const graded = mine.filter((s) => s.is_correct !== null);
    const correct = graded.filter((s) => s.is_correct).length;
    const durations = mine.map((s) => s.duration_sec).filter((d): d is number => d != null);

    const errCount = new Map<string, number>();
    for (const s of mine) {
      const e = effectiveError(s);
      if (isConcept(e)) errCount.set(e, (errCount.get(e) ?? 0) + 1);
    }
    const sortedErr = [...errCount.entries()].sort((a, b) => b[1] - a[1]);

    let trend: StudentRow["trend"] = null;
    if (graded.length >= 4) {
      const half = Math.floor(graded.length / 2);
      const acc = (arr: SubLite[]) => arr.filter((s) => s.is_correct).length / arr.length;
      const diff = acc(graded.slice(half)) - acc(graded.slice(0, half));
      trend = diff >= 0.2 ? "up" : diff <= -0.2 ? "down" : "flat";
    }

    return {
      ...st,
      submitted: mine.length,
      total: totalProblems,
      accuracy: graded.length ? correct / graded.length : null,
      avgSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      weakConcept: sortedErr[0]?.[0] ?? null,
      repeatErrors: sortedErr.filter(([, c]) => c >= 2).map(([type, count]) => ({ type, count })),
      trend,
      needsReview: mine.filter((s) => (s.status === "needs_review" || s.status === "error")).length,
      analyzing: mine.filter((s) => s.status === "pending" || s.status === "processing").length,
      hasDemo: mine.some((s) => s.is_demo),
    };
  });
}

export function fmtSec(sec: number | null) {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}분 ${s}초` : `${s}초`;
}

import { DEMO_CLASS, listAssignments } from "./assignments";
import { classMembers, type ClassInfo } from "./classes";
import { PROBLEMS } from "./problems";
import { listSubmissions } from "./store";
import { inkStats, supplementStudents, visibleTo, type Assignment, type ClassStats, type ErrorType, type Problem, type StudentStats, type Submission, type Trend } from "./types";

// 실제 제출·AI 분석 결과로 학생별 지표를 계산한다.
//  - 정답률은 문항마다 '최신 제출' 기준 (다시 제출하면 최신 것으로 대체)
//  - 반복 오류는 서로 다른 문항에서 같은 오류 유형이 나온 횟수 (고치기 전 풀이 포함)
//  - 교사가 수정한 오류 유형이 있으면 AI 판정보다 우선
//  - 정오 판정이 안 된 풀이(확인 필요)는 정답률 계산에서 빼고 '확인 필요'로 따로 센다
const NOT_AN_ERROR: ErrorType[] = ["NONE", "UNREADABLE"];

const errorOf = (s: Submission): ErrorType | null => {
  const e = s.teacher?.errorType ?? s.analysis?.errorType ?? null;
  return e && !NOT_AN_ERROR.includes(e) ? e : null;
};

function mostFrequent<T>(items: T[]): { value: T; count: number } | null {
  const m = new Map<T, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of m) if (!best || count > best.count) best = { value, count };
  return best;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

// 보충 과제 결과: 판정된 보충 문항의 2/3 이상을 맞히면 '개선'
export function supplementImproved(assignments: Assignment[], studentId: string, subs: Submission[]) {
  return assignments
    .filter((a) => supplementStudents(a.supplement).includes(studentId))
    .some((a) => {
      const latest = new Map<string, Submission>();
      for (const s of subs.filter((x) => x.studentId === studentId).sort((x, y) => x.submittedAt - y.submittedAt))
        if (a.problems.some((p) => p.id === s.problemId)) latest.set(s.problemId, s);
      const judged = [...latest.values()].filter((s) => typeof s.analysis?.correct === "boolean");
      return judged.length > 0 && judged.filter((s) => s.analysis!.correct).length / judged.length >= 2 / 3;
    });
}

export function statsForStudent(
  id: string,
  name: string,
  problems: Problem[],
  subs: Submission[],
  opts: { supplementImproved?: boolean } = {},
): StudentStats {
  const byProblem = new Map(problems.map((p) => [p.id, p]));
  const mine = subs.filter((s) => s.studentId === id && byProblem.has(s.problemId)).sort((a, b) => a.submittedAt - b.submittedAt);

  // 문항별 첫 제출 / 최신 제출
  const first = new Map<string, Submission>();
  const latest = new Map<string, Submission>();
  for (const s of mine) {
    if (!first.has(s.problemId)) first.set(s.problemId, s);
    latest.set(s.problemId, s);
  }
  const last = [...latest.values()];
  const judged = last.filter((s) => typeof s.analysis?.correct === "boolean");
  const correct = judged.filter((s) => s.analysis!.correct).length;
  const wrong = judged.filter((s) => !s.analysis!.correct);

  const conceptOf = (s: Submission) => s.analysis?.concept || byProblem.get(s.problemId)?.concept || "기타";
  const weak = mostFrequent(wrong.map(conceptOf));
  // 반복 오류: 문항마다 (다시 풀기 전 포함) 한 번이라도 나온 오류 유형을 1번씩 센다 → 서로 다른 문항에서 2번 이상이면 '반복'
  const errsPerProblem = [...latest.keys()].flatMap((pid) => [
    ...new Set(mine.filter((s) => s.problemId === pid).map(errorOf).filter((e): e is ErrorType => !!e)),
  ]);
  const errs = mostFrequent(errsPerProblem);
  const reviewCount = last.filter((s) => (s.status === "needs_review" || s.status === "error") && !s.teacher?.confirmedAt).length;

  // 다시 제출해서 오답 → 정답이 된 문항이 있으면 '개선'
  const improved = [...latest.keys()].some((pid) => first.get(pid)!.analysis?.correct === false && latest.get(pid)!.analysis?.correct === true);
  const trend: Trend = !last.length
    ? "-"
    : improved || opts.supplementImproved
      ? "개선"
      : reviewCount > 0 || (errs && errs.count >= 2)
        ? "확인 필요"
        : "유지";

  // 개념별: 첫 시도 정답률 → 최신 정답률 (다시 푼 문항이 있을 때만 after)
  const concepts = new Map<string, { firstOk: number; lastOk: number; n: number; retried: boolean }>();
  for (const [pid, l] of latest) {
    const f = first.get(pid)!;
    if (typeof l.analysis?.correct !== "boolean" || typeof f.analysis?.correct !== "boolean") continue;
    const c = concepts.get(conceptOf(l)) ?? { firstOk: 0, lastOk: 0, n: 0, retried: false };
    c.n++;
    c.firstOk += f.analysis.correct ? 1 : 0;
    c.lastOk += l.analysis.correct ? 1 : 0;
    c.retried ||= f.id !== l.id;
    concepts.set(conceptOf(l), c);
  }

  const durations = last.map((s) => inkStats(s).durationSec).filter((d) => d > 0);
  return {
    id,
    name,
    submitted: last.length,
    total: problems.length,
    judged: judged.length,
    accuracy: pct(correct, judged.length),
    avgSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    weakConcept: weak?.value ?? null,
    repeatedError: errs && errs.count >= 2 ? errs.value : null,
    topError: errs?.value ?? null,
    repeatedCount: errs?.count ?? 0,
    reviewCount,
    trend,
    attempts: mine.length,
    lastSubmittedAt: mine.length ? mine[mine.length - 1].submittedAt : null,
    conceptHistory: [...concepts].map(([concept, c]) => ({
      concept,
      before: pct(c.firstOk, c.n)!,
      after: c.retried ? pct(c.lastOk, c.n) : null,
      n: c.n,
    })),
  };
}

export type Period = { from?: number; to?: number }; // ms, 둘 다 포함. 비우면 처음부터 / 지금까지

// 한 반의 지표. assignmentId 가 없으면 그 반의 공개된 모든 과제 문항이 대상
// period 를 주면 그 기간에 제출한 풀이만으로 계산한다 (정답률·반복 오류·학습 변화 모두)
export async function computeClassStats(cls: ClassInfo, assignmentId: string | null, period: Period = {}): Promise<ClassStats> {
  const [all, allSubs, roster] = await Promise.all([listAssignments(), listSubmissions(), classMembers(cls.id)]);
  const subs = allSubs.filter(
    (s) => (period.from === undefined || s.submittedAt >= period.from) && (period.to === undefined || s.submittedAt <= period.to),
  );
  const assignments = all.filter((a) => a.classId === cls.id);
  const visible = assignments.filter((a) => a.published || a.id === assignmentId);
  // 예전 입학 레벨 테스트 과제(기능은 뺐지만 DB 에 남은 것)는 반 전체 지표에서 뺀다. 직접 고를 때만 넣는다
  const target = assignmentId ? visible.filter((a) => a.id === assignmentId) : visible.filter((a) => a.kind !== "diagnostic");
  // 과제가 지워지기 전 기본 문항으로 낸 예전 제출도 시연 반 '전체'에서는 보이게
  const legacy =
    assignmentId || cls.id !== DEMO_CLASS
      ? []
      : PROBLEMS.filter((p) => !all.some((a) => a.problems.some((q) => q.id === p.id)) && subs.some((s) => s.problemId === p.id));

  return {
    source: "real",
    classId: cls.id,
    archived: cls.archived,
    assignmentId,
    period: { from: period.from ?? null, to: period.to ?? null },
    // 과제 선택 목록에는 반 전체 과제만 (학생별 보충 과제는 학생 상세에서)
    assignments: visible.filter((a) => !a.studentIds?.length || a.id === assignmentId).map((a) => ({ id: a.id, title: a.title, problemIds: a.problems.map((p) => p.id) })),
    students: roster.map((s) => {
      // 학생마다 자기에게 배정된 과제의 문항만 센다
      const mine = target.filter((a) => visibleTo(a, s.id));
      const problems = [...mine.flatMap((a) => a.problems), ...legacy];
      // 과제 단위 제출: 문항을 다 낸 과제 수
      const done = new Set(subs.filter((x) => x.studentId === s.id).map((x) => x.problemId));
      return {
        ...statsForStudent(s.id, s.name, problems, subs, { supplementImproved: supplementImproved(assignments, s.id, subs) }),
        assignmentsDone: mine.filter((a) => a.problems.length > 0 && a.problems.every((p) => done.has(p.id))).length,
        assignmentsTotal: mine.length,
      };
    }),
  };
}

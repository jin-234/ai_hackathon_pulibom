import { studentCurrentClassIds } from "./classes";
import { query } from "./db";
import { PROBLEMS } from "./problems";
import { statusOf, visibleTo, type Assignment, type Problem, type SupplementInfo, type SupplementReview } from "./types";

export type { Assignment };

// 과제 저장소: PostgreSQL (assignments + problems). 과제는 반마다 따로
export const DEMO_CLASS = "c1-3"; // 기본 시연 과제를 만드는 반 (db/init/02_seed.sql)

type ARow = {
  id: string;
  class_id: string;
  title: string;
  published: boolean;
  closed_at: Date | null;
  due_at: Date | null;
  student_ids: string[] | null;
  supplement: SupplementInfo | null;
  created_at: Date;
  kind: string | null;
  problems: (Omit<Problem, "free" | "templateId"> & { free: boolean; templateId: string | null })[] | null;
};

function toAssignment(r: ARow): Assignment {
  return {
    id: r.id,
    classId: r.class_id,
    title: r.title,
    createdAt: r.created_at.getTime(),
    published: r.published,
    ...(r.closed_at ? { closedAt: r.closed_at.getTime() } : {}),
    ...(r.due_at ? { dueAt: r.due_at.getTime() } : {}),
    ...(r.student_ids?.length ? { studentIds: r.student_ids } : {}),
    ...(r.supplement ? { supplement: r.supplement } : {}),
    ...(r.kind === "diagnostic" ? { kind: "diagnostic" as const } : {}),
    problems: (r.problems ?? []).map(({ templateId, figure, ...p }) => ({
      ...p,
      ...(figure ? { figure } : {}),
      ...(p.free ? { free: true } : { free: undefined }),
      ...(templateId ? { templateId } : {}),
    })),
  };
}

// 과제 + 문항을 한 번에 (문항은 순서대로 JSON 배열로)
const SELECT = `
  SELECT a.id, a.class_id, a.title, a.published, a.closed_at, a.due_at, a.student_ids, a.supplement, a.created_at,
         to_jsonb(a)->>'kind' AS kind, -- 07_diagnostic.sql 전 DB 에서도 동작하게
         COALESCE(
           (SELECT json_agg(json_build_object('id', p.id, 'title', p.title, 'question', p.question, 'free', p.free,
                                              'answer', p.answer, 'concept', p.concept, 'solution', p.solution,
                                              'templateId', p.template_id, 'figure', to_jsonb(p)->'figure')
                            ORDER BY p.position)
              FROM problems p WHERE p.assignment_id = a.id),
           '[]') AS problems
    FROM assignments a`;

// classIds 를 주면 그 반들의 과제만
export async function listAssignments(filter: { classIds?: string[] } = {}): Promise<Assignment[]> {
  if (filter.classIds && !filter.classIds.length) return [];
  return (
    await query<ARow>(`${SELECT} WHERE ($1::text[] IS NULL OR a.class_id = ANY($1)) ORDER BY a.created_at DESC`, [filter.classIds ?? null])
  ).map(toAssignment);
}

export async function getAssignment(id: string) {
  const rows = await query<ARow>(`${SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ? toAssignment(rows[0]) : undefined;
}

// 학생이 볼 수 있는 과제인지: 지금 속한 반의 과제 + 반 전체 또는 그 학생에게 배정
export function studentCanSee(a: Assignment, studentId: string, classIds: string[]) {
  return classIds.includes(a.classId) && visibleTo(a, studentId);
}

// 학생에게 보이는 과제 (지금 속한 반 · 공개 · 배정된 것, 진행 중 → 마감 순). 보관된 지난 반 과제는 안 보인다
export async function listStudentAssignments(studentId: string) {
  const order = { open: 0, scheduled: 0, closed: 1, draft: 2 };
  const classIds = await studentCurrentClassIds(studentId);
  return (await listAssignments({ classIds }))
    .filter((a) => a.published && studentCanSee(a, studentId, classIds))
    .sort((a, b) => order[statusOf(a)] - order[statusOf(b)] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.createdAt - a.createdAt);
}

export async function findProblemWithAssignment(problemId: string) {
  const rows = await query<{ assignment_id: string }>(`SELECT assignment_id FROM problems WHERE id = $1`, [problemId]);
  if (rows[0]) {
    const assignment = await getAssignment(rows[0].assignment_id);
    const problem = assignment?.problems.find((p) => p.id === problemId);
    if (assignment && problem) return { problem, assignment };
  }
  const p = PROBLEMS.find((q) => q.id === problemId); // 기본 시연 문항 (과제가 지워진 예전 풀이용)
  return p ? { problem: p, assignment: undefined } : undefined;
}

export async function findProblem(problemId: string): Promise<Problem | undefined> {
  return (await findProblemWithAssignment(problemId))?.problem;
}

async function insertProblems(assignmentId: string, problems: Omit<Problem, "id">[] | Problem[]) {
  for (const [i, p] of problems.entries()) {
    await query(
      `INSERT INTO problems (id, assignment_id, position, title, question, free, answer, concept, solution, template_id${p.figure ? ", figure" : ""})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10${p.figure ? ", $11" : ""}) ON CONFLICT (id) DO NOTHING`,
      [
        "id" in p ? p.id : `${assignmentId}-p${i + 1}`,
        assignmentId,
        i + 1,
        p.title,
        p.question,
        Boolean(p.free),
        p.answer ?? "",
        p.concept ?? "",
        p.solution ?? [],
        p.templateId ?? null,
        ...(p.figure ? [JSON.stringify(p.figure)] : []), // 그림이 없으면 figure 칸을 안 써서 12_problem_figures.sql 전 DB 에서도 동작
      ],
    );
  }
}

export async function createAssignment(
  title: string,
  problems: Omit<Problem, "id">[],
  opts: { classId: string; publish: boolean; dueAt?: number; studentIds?: string[]; supplement?: SupplementInfo; id?: string; createdAt?: number },
) {
  const id = opts.id ?? `a${Date.now().toString(36)}`;
  await query(
    `INSERT INTO assignments (id, class_id, title, published, due_at, student_ids, supplement, created_at)
     VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, to_timestamp($8 / 1000.0))`,
    [
      id,
      opts.classId,
      title,
      opts.publish,
      opts.dueAt ?? null,
      opts.studentIds?.length ? opts.studentIds : null,
      opts.supplement ? JSON.stringify(opts.supplement) : null,
      opts.createdAt ?? Date.now(),
    ],
  );
  await insertProblems(id, problems);
  return (await getAssignment(id))!;
}

// 기본 시연 과제: 시연 반에 과제가 하나도 없을 때 한 번 만든다 (npm run db:setup)
export async function ensureDefaultAssignment() {
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM assignments WHERE class_id = $1`, [DEMO_CLASS]);
  if (Number(n) > 0) return false;
  await query(
    `INSERT INTO assignments (id, class_id, title, published, created_at) VALUES ('a1', $1, '수학 1-1 · 일차방정식', true, to_timestamp(0))
     ON CONFLICT DO NOTHING`,
    [DEMO_CLASS],
  );
  await insertProblems("a1", PROBLEMS);
  return true;
}

export type AssignmentPatch = { title?: string; published?: boolean; closed?: boolean; dueAt?: number | null };

export async function updateAssignment(id: string, patch: AssignmentPatch) {
  const cur = await getAssignment(id);
  if (!cur) return null;
  const sets: string[] = [];
  const values: unknown[] = [id];
  const set = (col: string, v: unknown, cast = "") => {
    values.push(v);
    sets.push(`${col} = ${cast ? cast.replace("?", `$${values.length}`) : `$${values.length}`}`);
  };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.published !== undefined) set("published", patch.published);
  if (patch.dueAt !== undefined) set("due_at", patch.dueAt, "to_timestamp(? / 1000.0)");
  if (patch.closed === true) sets.push("closed_at = now()");
  if (patch.closed === false) {
    sets.push("closed_at = NULL");
    // 지난 예약 마감도 풀어 준다 (새 예약을 같이 보낸 경우는 그 값 유지)
    if (patch.dueAt === undefined && cur.dueAt && cur.dueAt <= Date.now()) sets.push("due_at = NULL");
  }
  if (sets.length) await query(`UPDATE assignments SET ${sets.join(", ")} WHERE id = $1`, values);
  return getAssignment(id);
}

// 이미 낸 과제의 문항 정답 고치기 (빈 값이면 정답 없음 → 일차방정식은 풀이기, 그 밖은 AI 가 직접 풀어 채점)
export async function setProblemAnswer(assignmentId: string, problemId: string, answer: string) {
  const rows = await query<{ id: string }>(`UPDATE problems SET answer = $3 WHERE id = $2 AND assignment_id = $1 RETURNING id`, [assignmentId, problemId, answer]);
  return rows.length > 0;
}

// 학생별 AI 변화 분석 저장 (supplement.reviews[학생ID])
export async function setSupplementReview(id: string, studentId: string, review: SupplementReview) {
  const rows = await query<{ id: string }>(
    `UPDATE assignments
        SET supplement = jsonb_set(supplement, '{reviews}', COALESCE(supplement->'reviews', '{}'::jsonb) || jsonb_build_object($3::text, $2::jsonb))
      WHERE id = $1 AND supplement IS NOT NULL RETURNING id`,
    [id, JSON.stringify(review), studentId],
  );
  return rows[0] ? getAssignment(id) : null;
}

export async function deleteAssignment(id: string) {
  const [{ n }] = await query<{ n: string }>(
    `SELECT count(*) AS n FROM assignments WHERE class_id = (SELECT class_id FROM assignments WHERE id = $1)`,
    [id],
  );
  if (Number(n) <= 1) return false; // 반의 마지막 과제는 지우지 않는다
  // 과제를 지우면 그 문항으로 낸 학생 풀이도 함께 지운다 (문항이 없으면 요약·다시 인식에 못 쓰는 기록만 남으므로).
  // 한 문장으로 묶어 둘 다 지워지거나 둘 다 남는다. 문항은 CASCADE
  const rows = await query<{ deleted: string }>(
    `WITH gone AS (DELETE FROM submissions WHERE problem_id IN (SELECT id FROM problems WHERE assignment_id = $1) RETURNING id),
          a AS (DELETE FROM assignments WHERE id = $1 RETURNING id)
     SELECT (SELECT count(*) FROM a) AS deleted`,
    [id],
  );
  return Number(rows[0]?.deleted) > 0;
}

// 이 과제 문항으로 학생이 낸 풀이 수 (삭제 전 확인용)
export async function countAssignmentSubmissions(id: string) {
  const [{ n }] = await query<{ n: string }>(
    `SELECT count(*) AS n FROM submissions WHERE problem_id IN (SELECT id FROM problems WHERE assignment_id = $1)`,
    [id],
  );
  return Number(n);
}

import { query } from "./db";
import type { Stroke } from "./types";

// 풀던 중인 풀이 (제출 전 자동 저장). 제출하면 지운다
export type Draft = { strokes?: Stroke[]; scratch?: Stroke[]; answer?: string; updatedAt: number };

// 바뀐 칸만 덮어쓴다 (보내지 않은 칸은 그대로)
export async function saveDraft(studentId: string, problemId: string, patch: { strokes?: Stroke[]; scratch?: Stroke[]; answer?: string }) {
  await query(
    `INSERT INTO drafts (student_id, problem_id, strokes, scratch, answer, updated_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (student_id, problem_id) DO UPDATE SET
       strokes = COALESCE(EXCLUDED.strokes, drafts.strokes),
       scratch = COALESCE(EXCLUDED.scratch, drafts.scratch),
       answer = COALESCE(EXCLUDED.answer, drafts.answer),
       updated_at = now()`,
    [
      studentId,
      problemId,
      patch.strokes ? JSON.stringify(patch.strokes) : null,
      patch.scratch ? JSON.stringify(patch.scratch) : null,
      patch.answer ?? null,
    ],
  );
}

export async function listDrafts(studentId: string, problemIds: string[]): Promise<Record<string, Draft>> {
  if (!problemIds.length) return {};
  const rows = await query<{ problem_id: string; strokes: Stroke[] | null; scratch: Stroke[] | null; answer: string | null; updated_at: Date }>(
    `SELECT problem_id, strokes, scratch, answer, updated_at FROM drafts WHERE student_id = $1 AND problem_id = ANY($2)`,
    [studentId, problemIds],
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.problem_id,
      {
        ...(r.strokes ? { strokes: r.strokes } : {}),
        ...(r.scratch ? { scratch: r.scratch } : {}),
        ...(r.answer !== null ? { answer: r.answer } : {}),
        updatedAt: r.updated_at.getTime(),
      },
    ]),
  );
}

export async function deleteDraft(studentId: string, problemId: string) {
  await query(`DELETE FROM drafts WHERE student_id = $1 AND problem_id = $2`, [studentId, problemId]);
}

import { query } from "./db";
import type { Submission } from "./types";

// 학생 풀이 저장소: PostgreSQL(submissions). 풀이 이미지(PNG)도 같은 행의 image 칸에 저장

type Row = {
  id: string;
  student_id: string;
  problem_id: string;
  question: string | null;
  started_at: Date;
  submitted_at: Date;
  strokes?: Submission["strokes"];
  events: Submission["events"];
  ocr_lines: string[];
  ocr_raw?: unknown;
  status: Submission["status"];
  status_message: string | null;
  analysis: Submission["analysis"] | null;
  teacher: Submission["teacher"] | null;
  class_id?: string | null;
  class_name?: string | null;
  school_year?: number | null;
  class_archived?: boolean | null;
  teacher_names?: string | null;
  concept?: string | null;
  problem_answer?: string | null;
  vision_read?: boolean | null;
  answer_text?: string | null;
  answer_correct?: boolean | null;
};

function toSubmission(r: Row): Submission {
  return {
    id: r.id,
    studentId: r.student_id,
    problemId: r.problem_id,
    ...(r.question ? { question: r.question } : {}),
    ...(r.concept ? { concept: r.concept } : {}),
    startedAt: r.started_at.getTime(),
    submittedAt: r.submitted_at.getTime(),
    strokes: r.strokes ?? [],
    events: r.events ?? [],
    ocrLines: r.ocr_lines ?? [],
    ...unpackOcrRaw(r.ocr_raw),
    ...(r.problem_answer ? { problemAnswer: r.problem_answer } : {}),
    ...(r.vision_read ? { visionRead: true } : {}),
    ...(r.answer_text ? { answerText: r.answer_text } : {}),
    ...(r.answer_correct !== undefined ? { answerCorrect: r.answer_correct } : {}),
    status: r.status,
    ...(r.status_message ? { statusMessage: r.status_message } : {}),
    ...(r.analysis ? { analysis: r.analysis } : {}),
    ...(r.teacher ? { teacher: r.teacher } : {}),
    ...(r.class_id
      ? {
          origin: {
            classId: r.class_id,
            className: r.class_name ?? "",
            schoolYear: r.school_year ?? 0,
            archived: Boolean(r.class_archived),
            teachers: r.teacher_names ?? "",
          },
        }
      : {}),
  };
}

// ocr_raw 에는 OCR 원본 응답과 줄별 신뢰도를 { raw, confidences } 로 함께 넣는다 (스키마를 바꾸지 않고 신뢰도를 남기려고)
// 옛 형식(원본 응답만)이면 그대로 ocrRaw 로 둔다
function unpackOcrRaw(v: unknown): Pick<Submission, "ocrRaw" | "ocrConfidence"> {
  if (v === undefined || v === null) return {};
  if (typeof v === "object" && !Array.isArray(v) && "raw" in v && Array.isArray((v as { confidences?: unknown }).confidences)) {
    const p = v as { raw: unknown; confidences: number[] };
    return { ...(p.raw !== undefined && p.raw !== null ? { ocrRaw: p.raw } : {}), ocrConfidence: p.confidences };
  }
  return { ocrRaw: v };
}
const packOcrRaw = (raw: unknown, confidences: number[] | undefined) =>
  confidences ? JSON.stringify({ raw: raw ?? null, confidences }) : json(raw);

// 풀이 → 문항 → 과제 → 반: 어느 학년도·반 기록인지 같이 가져온다
const WITH_ORIGIN = `
  FROM submissions s
  LEFT JOIN problems p ON p.id = s.problem_id
  LEFT JOIN assignments a ON a.id = p.assignment_id
  LEFT JOIN classes c ON c.id = a.class_id`;
const ORIGIN_COLUMNS = `p.concept, p.answer AS problem_answer,
  COALESCE(s.ocr_raw -> 'pulibomVision', s.ocr_raw -> 'raw' -> 'pulibomVision') IS NOT NULL AS vision_read, a.class_id, c.name AS class_name, c.school_year, c.archived AS class_archived,
  (SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM teacher_classes tc JOIN teachers t ON t.id = tc.teacher_id
    WHERE tc.class_id = a.class_id) AS teacher_names`;

const isId = (id: string) => /^[\w-]+$/.test(id);
const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

export async function saveSubmission(s: Submission, png: Buffer | null) {
  await query(
    `INSERT INTO submissions (id, student_id, problem_id, question, started_at, submitted_at, strokes, events, image,
                              ocr_lines, ocr_raw, status, status_message, analysis, teacher, answer_text, answer_correct)
     VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (id) DO NOTHING`,
    [
      s.id,
      s.studentId,
      s.problemId,
      s.question ?? null,
      s.startedAt,
      s.submittedAt,
      JSON.stringify(s.strokes ?? []),
      JSON.stringify(s.events ?? []),
      png,
      s.ocrLines ?? [],
      packOcrRaw(s.ocrRaw, s.ocrConfidence),
      s.status,
      s.statusMessage ?? null,
      json(s.analysis),
      json(s.teacher),
      s.answerText ?? null,
      s.answerCorrect ?? null,
    ],
  );
}

export async function readImage(id: string): Promise<Buffer | null> {
  if (!isId(id)) return null;
  const rows = await query<{ image: Buffer | null }>(`SELECT image FROM submissions WHERE id = $1`, [id]);
  return rows[0]?.image ?? null;
}

// 이미지는 크니까 상세 조회에서도 빼고, 필요할 때 readImage 로 따로 가져온다
const DETAIL = `s.id, s.student_id, s.problem_id, s.question, s.started_at, s.submitted_at, s.strokes, s.events, s.ocr_lines, s.ocr_raw,
                s.status, s.status_message, s.analysis, s.teacher, s.answer_text, s.answer_correct, ${ORIGIN_COLUMNS}`;

export async function getSubmission(id: string): Promise<Submission | null> {
  if (!isId(id)) return null;
  const rows = await query<Row>(`SELECT ${DETAIL} ${WITH_ORIGIN} WHERE s.id = $1`, [id]);
  return rows[0] ? toSubmission(rows[0]) : null;
}

// 목록: 무거운 필드(필기 획 좌표, OCR 원본 응답)는 빼고 가져온다
export async function listSubmissions(filter: { studentId?: string } = {}): Promise<Submission[]> {
  const rows = await query<Row>(
    `SELECT s.id, s.student_id, s.problem_id, s.question, s.started_at, s.submitted_at, s.events, s.ocr_lines,
            s.status, s.status_message, s.analysis, s.teacher, s.answer_text, s.answer_correct, ${ORIGIN_COLUMNS}
       ${WITH_ORIGIN}
      WHERE ($1::text IS NULL OR s.student_id = $1)
      ORDER BY s.submitted_at DESC`,
    [filter.studentId ?? null],
  );
  return rows.map(toSubmission);
}

// 학생이 문항마다 마지막으로 낸 풀이의 필기 획 (다시 풀 때 이전 풀이 위에서 고치도록)
export async function latestStrokes(studentId: string, problemIds: string[]): Promise<Record<string, Submission["strokes"]>> {
  if (!problemIds.length) return {};
  const rows = await query<{ problem_id: string; strokes: Submission["strokes"] | null }>(
    `SELECT DISTINCT ON (problem_id) problem_id, strokes FROM submissions
      WHERE student_id = $1 AND problem_id = ANY($2)
      ORDER BY problem_id, submitted_at DESC`,
    [studentId, problemIds],
  );
  return Object.fromEntries(rows.map((r) => [r.problem_id, r.strokes ?? []]));
}

// 학생이 문항마다 마지막으로 낸 답안 칸 답 (다시 풀 때 그 답으로 시작)
export async function latestAnswers(studentId: string, problemIds: string[]): Promise<Record<string, string>> {
  if (!problemIds.length) return {};
  const rows = await query<{ problem_id: string; answer_text: string | null }>(
    `SELECT DISTINCT ON (problem_id) problem_id, answer_text FROM submissions
      WHERE student_id = $1 AND problem_id = ANY($2)
      ORDER BY problem_id, submitted_at DESC`,
    [studentId, problemIds],
  );
  return Object.fromEntries(rows.filter((r) => r.answer_text).map((r) => [r.problem_id, r.answer_text!]));
}

// 바뀐 항목만 UPDATE (분석 파이프라인과 교사 수정이 동시에 와도 서로 덮어쓰지 않게)
const COLUMNS: Partial<Record<keyof Submission, [string, (v: unknown) => unknown]>> = {
  ocrLines: ["ocr_lines", (v) => v ?? []],
  status: ["status", (v) => v],
  statusMessage: ["status_message", (v) => v ?? null],
  analysis: ["analysis", json],
  teacher: ["teacher", json],
};

export async function updateSubmission(id: string, patch: Partial<Submission>) {
  if (!isId(id)) return null;
  const sets: string[] = [];
  const values: unknown[] = [id];
  // OCR 원본과 줄별 신뢰도는 ocr_raw 한 칸에 같이 쓴다
  if ("ocrRaw" in patch || "ocrConfidence" in patch) {
    values.push(packOcrRaw(patch.ocrRaw, patch.ocrConfidence));
    sets.push(`ocr_raw = $${values.length}`);
  }
  for (const [k, v] of Object.entries(patch) as [keyof Submission, unknown][]) {
    const col = COLUMNS[k];
    if (!col) continue;
    values.push(col[1](v));
    sets.push(`${col[0]} = $${values.length}`);
  }
  if (sets.length) await query(`UPDATE submissions SET ${sets.join(", ")} WHERE id = $1`, values);
  return getSubmission(id);
}

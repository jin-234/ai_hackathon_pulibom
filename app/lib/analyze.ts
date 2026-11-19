import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runClaude } from "./claude";
import { CONCEPTS, CONCEPT_KEYS, ERROR_TYPES, isConcept } from "./constants";
import { runOcrChain } from "./ocr";
import { BUCKET, db } from "./supabase";

export type Analysis = {
  steps: { line: string; ok: boolean; note: string }[];
  first_error_step: number; // 1부터, 0 = 오류 없음
  error_type: (typeof ERROR_TYPES)[number];
  related_concept: string;
  reason: string;
  suggestion: string;
  check_question: string;
  confidence: number;
  needs_review: boolean;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { line: { type: "string" }, ok: { type: "boolean" }, note: { type: "string" } },
        required: ["line", "ok", "note"],
      },
    },
    first_error_step: { type: "integer", minimum: 0 },
    error_type: { type: "string", enum: [...ERROR_TYPES] },
    related_concept: { type: "string", enum: [...CONCEPT_KEYS, "none"] },
    reason: { type: "string" },
    suggestion: { type: "string" },
    check_question: { type: "string" },
    confidence: { type: "number" },
    needs_review: { type: "boolean" },
  },
  required: [
    "steps",
    "first_error_step",
    "error_type",
    "related_concept",
    "reason",
    "suggestion",
    "check_question",
    "confidence",
    "needs_review",
  ],
};

// ---- 간단한 인메모리 큐 (dev 서버 HMR에도 유지되도록 globalThis에 둠) ----
type Queue = { running: number; waiting: string[]; inflight: Set<string> };
const g = globalThis as unknown as { __pulibomQueue?: Queue };
const queue: Queue = (g.__pulibomQueue ??= { running: 0, waiting: [], inflight: new Set() });
const CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY ?? 2);

export function enqueueAnalysis(id: string) {
  if (queue.inflight.has(id)) return;
  queue.inflight.add(id);
  queue.waiting.push(id);
  pump();
}

function pump() {
  while (queue.running < CONCURRENCY && queue.waiting.length) {
    const id = queue.waiting.shift()!;
    queue.running++;
    processSubmission(id).finally(() => {
      queue.running--;
      queue.inflight.delete(id);
      pump();
    });
  }
}

// ---- 파이프라인: 이미지 → OCR 폴백 체인 → Claude 풀이 분석 → DB 저장 ----
async function processSubmission(id: string) {
  const supabase = db();
  let dir: string | null = null;
  try {
    await supabase.from("submissions").update({ status: "processing", error_message: null }).eq("id", id);

    const { data: sub, error } = await supabase
      .from("submissions")
      .select("id, image_path, final_answer, is_correct, problem:problems(content, answer, solution, concept)")
      .eq("id", id)
      .single();
    if (error || !sub) throw new Error(`제출 기록 없음: ${error?.message}`);
    if (!sub.image_path) throw new Error("풀이 이미지 없음");
    const problem = sub.problem as unknown as { content: string; answer: string; solution: string; concept: string };

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(sub.image_path);
    if (dlErr || !blob) throw new Error(`이미지 다운로드 실패: ${dlErr?.message}`);
    const image = Buffer.from(await blob.arrayBuffer());

    dir = await mkdtemp(path.join(tmpdir(), "pulibom-"));
    await writeFile(path.join(dir, "solution.png"), image);

    // 1) OCR
    const { result: ocr, attempts } = await runOcrChain(image, dir);
    await supabase
      .from("submissions")
      .update({
        ocr_attempts: attempts,
        ocr_engine: ocr?.engine ?? null,
        ocr_text: ocr?.text ?? null,
        ocr_confidence: ocr?.confidence ?? null,
      })
      .eq("id", id);

    if (!ocr) {
      await supabase
        .from("submissions")
        .update({ status: "needs_review", error_message: "모든 OCR 엔진이 풀이를 읽지 못함" })
        .eq("id", id);
      return;
    }

    // 2) 풀이 분석 (Claude 헤드리스, 원본 이미지 + OCR 결과 함께)
    const analysis = await analyzeSolution(dir, problem, sub.final_answer, sub.is_correct, ocr);

    const concept = isConcept(analysis.error_type)
      ? analysis.error_type
      : isConcept(analysis.related_concept)
        ? analysis.related_concept
        : null;

    await supabase
      .from("submissions")
      .update({
        analysis,
        error_type: analysis.error_type,
        concept: analysis.error_type === "none" ? null : concept,
        status: analysis.needs_review ? "needs_review" : "done",
      })
      .eq("id", id);
  } catch (e) {
    console.error("[analyze]", id, e);
    await supabase
      .from("submissions")
      .update({ status: "error", error_message: (e as Error).message.slice(0, 500) })
      .eq("id", id);
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

// dir 안의 solution.png 를 Claude가 직접 보면서 분석 (DB 없이도 호출 가능 → scripts/test-pipeline.ts)
export function analyzeSolution(
  dir: string,
  problem: { content: string; answer: string; solution: string },
  finalAnswer: string | null,
  isCorrect: boolean | null,
  ocr: { engine: string; text: string },
) {
  return runClaude<Analysis>({
    cwd: dir,
    allowRead: true,
    prompt: buildPrompt(problem, finalAnswer, isCorrect, ocr.engine, ocr.text),
    schema: ANALYSIS_SCHEMA,
  });
}

function buildPrompt(
  problem: { content: string; answer: string; solution: string },
  finalAnswer: string | null,
  isCorrect: boolean | null,
  engine: string,
  ocrText: string,
) {
  const types = Object.entries(CONCEPTS)
    .map(([k, v]) => `- ${k}: ${v.error} (${v.desc})`)
    .join("\n");
  return `너는 중학교 1학년 수학 교사를 돕는 풀이 분석가다. 학생의 일차방정식 풀이에서 "어디서 처음 막혔는지"를 찾는다.

[문제] ${problem.content}
[정답] x = ${problem.answer}
[모범 풀이] ${problem.solution}
[학생이 입력한 최종 답] ${finalAnswer ?? "(없음)"} → 시스템 채점: ${isCorrect ? "정답" : "오답"}

[손글씨 인식 결과 (${engine})]
${ocrText}

원본 풀이 이미지는 ./solution.png 에 있다. 반드시 Read 도구로 직접 보고, 인식 결과에 잘못 읽힌 글자가 있으면 이미지 기준으로 판단한다.

할 일:
1. 풀이를 줄 단위 steps 로 정리한다 (학생이 쓴 그대로, line). 각 줄이 앞 줄에서 올바르게 이어졌으면 ok=true, 아니면 ok=false 와 note 에 짧은 이유.
2. first_error_step: 처음 틀린 줄 번호(1부터). 오류가 없으면 0.
3. error_type: 처음 오류의 유형. 아래 중 하나, 오류가 없으면 none, 어디에도 안 맞으면 other.
${types}
4. related_concept: 보충이 필요한 개념 키 (위 목록의 키), 없으면 none.
5. reason: 교사가 볼 근거. 학생이 쓴 실제 식을 인용해서 한두 문장. (예: "'2x+3=11'을 '2x=11+3'으로 옮기며 +3의 부호를 바꾸지 않음")
6. suggestion: 교사의 보충 지도 방향 한 문장.
7. check_question: 학생에게 던질 확인 질문 한 문장.
8. confidence: 분석 확신도 0~1.
9. needs_review: 손글씨 판독이 애매하거나 풀이가 너무 짧아 오류 위치를 특정할 수 없을 때만 true. 오류 위치가 분명하면 false.

정답이어도 중간 과정에 문제가 있으면 짚는다. 한 번의 오답만으로 개념 부족을 단정하지 않는다. 모든 문장은 한국어로.`;
}

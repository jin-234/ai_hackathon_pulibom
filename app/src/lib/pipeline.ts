import { analyzeSolution, hasUpstageKey, runOcr, variableOf } from "./ai";
import { findProblem } from "./assignments";
import { hasClaude } from "./claude";
import { ocrFromStrokes } from "./ocrImage";
import { updateSubmission } from "./store";
import { inkStats, type Submission } from "./types";
import { VISION_CONFIDENCE, readWhole } from "./vision";

// 제출 1건 분석: OCR용 이미지 렌더링 → 업스테이지 OCR → (확신 없는 줄) Mathpix → Claude 다시 읽기
//              → Claude 헤드리스 보정·분석 → 저장
export async function runPipeline(s: Submission, png: Buffer) {
  try {
    if (!hasUpstageKey() && !hasClaude()) {
      await updateSubmission(s.id, { status: "error", statusMessage: "UPSTAGE_API_KEY 가 .env 에 없습니다." });
      return;
    }
    const problem = await findProblem(s.problemId);
    if (!problem) throw new Error("문항을 찾을 수 없어요 (과제가 삭제됨).");
    const v = variableOf(problem); // 미지수 글자 (x 가 아닌 y·a·b·m·n·i 문항도 그 글자로 읽고 보정)
    const ocr = await readSolution(s, png, v);
    const { lines, confidences, raw } = ocr;
    await updateSubmission(s.id, { ocrLines: lines, ocrConfidence: confidences, ocrRaw: raw });
    const stats = inkStats(s);
    const analysis = await analyzeSolution({
      problem,
      png,
      ocrLines: lines,
      ocrConfidence: confidences,
      ocrFractions: ocr.fractions,
      durationSec: stats.durationSec,
      erases: stats.erases,
    });
    await updateSubmission(s.id, {
      analysis,
      status: analysis.needsReview ? "needs_review" : "done",
    });
  } catch (e) {
    await updateSubmission(s.id, { status: "error", statusMessage: (e as Error).message });
  }
}

// 손글씨 읽기: 업스테이지 OCR(획으로 다시 그린 이미지, 없으면 원본 PNG).
// 업스테이지 키가 없거나 호출이 실패하면 원본 PNG 를 Mathpix → Claude 로 통째로 읽는다.
async function readSolution(s: Submission, png: Buffer, v: string) {
  let upstageError = "";
  if (hasUpstageKey()) {
    try {
      return (await ocrFromStrokes(s.strokes, v)) ?? { ...(await runOcr(png, undefined, v)), fractions: undefined };
    } catch (e) {
      upstageError = (e as Error).message;
    }
  } else upstageError = "UPSTAGE_API_KEY 없음";

  const whole = await readWhole(png, v);
  if (!whole.lines.length) {
    throw new Error(`손글씨를 읽지 못했어요 (업스테이지: ${upstageError} / ${whole.attempts.map((a) => `${a.engine}: ${a.reason ?? "실패"}`).join(" / ")})`);
  }
  return {
    lines: whole.lines,
    confidences: whole.lines.map(() => VISION_CONFIDENCE),
    fractions: undefined,
    raw: { pulibomVision: { model: whole.model ?? "", mode: "full", ocr: [], lines: [], upstageError, attempts: whole.attempts } },
  };
}

import { analyzeSolution, hasUpstageKey, runOcr, variableOf } from "./ai";
import { findProblem } from "./assignments";
import { ocrFromStrokes } from "./ocrImage";
import { updateSubmission } from "./store";
import { inkStats, type Submission } from "./types";

// 제출 1건 분석: OCR용 이미지 렌더링 → 업스테이지 OCR → (확신 없으면) Mathpix → Claude 다시 읽기 → Solar 보정·채점 → 저장
export async function runPipeline(s: Submission, png: Buffer) {
  try {
    if (!hasUpstageKey()) {
      await updateSubmission(s.id, { status: "error", statusMessage: "UPSTAGE_API_KEY 가 .env 에 없습니다." });
      return;
    }
    const problem = await findProblem(s.problemId);
    if (!problem) throw new Error("문항을 찾을 수 없어요 (과제가 삭제됨).");
    // 획 기록으로 OCR 전용 이미지를 다시 그린다 (획이 없으면 원본 PNG)
    const v = variableOf(problem); // 미지수 글자 (x 가 아닌 y·a·b·m·n·i 문항도 그 글자로 읽고 보정)
    const ocr = (await ocrFromStrokes(s.strokes, v)) ?? { ...(await runOcr(png, undefined, v)), fractions: undefined, marks: [] };
    const { lines, confidences, raw } = ocr;
    await updateSubmission(s.id, { ocrLines: lines, ocrConfidence: confidences, ocrRaw: raw });
    const stats = inkStats(s);
    const analysis = await analyzeSolution({
      problem,
      ocrLines: lines,
      ocrConfidence: confidences,
      ocrFractions: ocr.fractions,
      ocrMarks: ocr.marks,
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

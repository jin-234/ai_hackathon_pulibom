import { solveLinear, type Solved } from "./equation";
import { variableOf, type Problem } from "./types";

export type QuestionInput = { question: string; answer?: string; solution?: string; concept?: string; templateId?: string };

// 풀이기는 x 만 읽으므로, y·a·b·m·n·i 로 낸 식은 x 로 바꿔 풀고 정답·해설을 다시 그 글자로 쓴다
function solveAny(question: string): Solved {
  const v = variableOf({ question, answer: "" });
  if (!v || v === "x" || question.includes("x")) return solveLinear(question);
  const s = solveLinear(question.split(v).join("x"));
  const back = (t: string) => t.replace(/x/g, v);
  return { ...s, question: back(s.question), answer: back(s.answer), steps: s.steps.map(back) };
}

// 교사가 입력한 문항 → 저장할 문항. 일차방정식이면 정답·해설 자동 (교사가 쓴 값 우선), 아니면 자유 문항
export function buildProblems(questions: QuestionInput[]): Omit<Problem, "id">[] {
  const problems = questions
    .filter((q) => q.question?.trim())
    .map((q, i) => {
      const manualSolution = (q.solution ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      try {
        const s = solveAny(q.question);
        return {
          title: `${i + 1}번 문항`,
          question: s.question,
          answer: q.answer?.trim() || s.answer,
          concept: q.concept?.trim() || s.concept,
          solution: manualSolution.length ? manualSolution : s.steps,
          // 문제은행 틀에서 만든 문항이면 그 틀 (id 모양만 확인)
          ...(q.templateId && /^[\w-]+$/.test(q.templateId) ? { templateId: q.templateId } : {}),
        };
      } catch {
        return {
          title: `${i + 1}번 문항`,
          question: q.question.trim(),
          free: true,
          answer: q.answer?.trim() ?? "",
          concept: q.concept?.trim() ?? "",
          solution: manualSolution,
          // 문제은행 계산 틀에서 만든 문항이면 그 틀
          ...(q.templateId && /^[\w-]+$/.test(q.templateId) ? { templateId: q.templateId } : {}),
        };
      }
    });
  if (!problems.length) throw new Error("문항을 한 개 이상 넣어 주세요.");
  return problems;
}

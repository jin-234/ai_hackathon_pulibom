import { solveLinear, type Solved } from "./equation";
import { sanitizeFigure } from "./figure";
import { asFormat, pickChoices, splitChoices } from "./problemFormat";
import { variableOf, type Problem } from "./types";

export type QuestionInput = { question: string; answer?: string; solution?: string; concept?: string; templateId?: string; figure?: unknown; format?: unknown };

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
      // 그림: 서버에서 다시 검사 (좌표·표시가 안 맞거나 형식이 틀리면 출제를 막는다)
      const fig = q.figure ? sanitizeFigure(q.figure) : {};
      if (q.figure && !fig.figure) throw new Error(`${i + 1}번 문항 그림: ${fig.problem ?? "그릴 수 없어요"}`);
      const figure = fig.figure ? { figure: fig.figure } : {};
      const format = asFormat(q.format);
      // 객관식: 보기 2개 이상 + 정답은 그 보기 중 하나 이상. 정답은 "③ 보기 내용" (여러 개면 "② …, ④ …") 꼴로 맞춰 저장한다 (풀이기로 풀지 않음)
      if (format === "choice") {
        const { stem, choices } = splitChoices(q.question.trim());
        if (!stem.trim()) throw new Error(`${i + 1}번 문항: 객관식 문제 글을 입력해 주세요.`);
        if (choices.length < 2) throw new Error(`${i + 1}번 문항: 객관식 보기를 두 개 이상 넣어 주세요.`);
        const picked = pickChoices(q.answer, choices);
        if (!picked) throw new Error(`${i + 1}번 문항: 객관식 정답 보기를 골라 주세요.`);
        return {
          title: `${i + 1}번 문항`,
          question: q.question.trim(),
          free: true,
          answer: picked,
          concept: q.concept?.trim() ?? "",
          solution: manualSolution,
          format,
          ...(q.templateId && /^[\w-]+$/.test(q.templateId) ? { templateId: q.templateId } : {}),
          ...figure,
        };
      }
      const essay = format === "essay" ? { format } : {};
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
          ...figure,
          ...essay,
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
          ...figure,
          ...essay,
        };
      }
    });
  if (!problems.length) throw new Error("문항을 한 개 이상 넣어 주세요.");
  return problems;
}

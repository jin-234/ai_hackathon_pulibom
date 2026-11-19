// 문항 유형: 객관식(보기 중 하나 고르기) / 서술형(풀이를 손으로 쓰고 답을 적기)
//  - 객관식 문항은 question 끝에 ① ② ③ … 보기를 붙여 저장하고, 정답은 "③ (x - 2)(x + 2)" 처럼 번호 + 내용
//  - 유형을 정하지 않은 예전 문항은 문제 글에 보기 번호가 두 개 이상 있으면 객관식으로 본다
export type ProblemFormat = "choice" | "essay";

export const FORMAT_LABEL: Record<ProblemFormat, string> = { choice: "객관식", essay: "서술형" };

export const asFormat = (v: unknown): ProblemFormat | undefined => (v === "choice" || v === "essay" ? v : undefined);

export const CHOICE_MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
const MARK = /[①-⑩]/;

// "점 C(0, 7)에 대한 설명으로 옳은 것은? (① x축 위에 있다 ② y축 위에 있다 …)" → 문제 글 + 보기 목록 (보기는 번호 포함)
export function splitChoices(text: string): { stem: string; choices: string[] } {
  const at = text.search(MARK);
  if (at < 0) return { stem: text, choices: [] };
  let stem = text.slice(0, at).trimEnd();
  let rest = text.slice(at);
  // 보기 전체를 감싼 괄호 "( … )" 는 뗀다
  if (stem.endsWith("(") && rest.trimEnd().endsWith(")")) {
    stem = stem.slice(0, -1).trimEnd();
    rest = rest.trimEnd().slice(0, -1);
  }
  const choices = rest
    .split(/(?=[①-⑩])/)
    .map((c) => c.trim().replace(/[,，]$/, ""))
    .filter(Boolean);
  return { stem, choices };
}

// 보기 내용(번호 없이)을 번호를 붙여 문제 글 뒤에 잇는다. 빈 보기는 뺀다
export function joinChoices(stem: string, options: string[]): string {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  return [stem.trim(), ...opts.map((o, i) => `${CHOICE_MARKS[i]} ${o}`)].join(" ");
}

// 보기 "③ (x - 2)(x + 2)" → 번호를 뗀 내용
export const choiceBody = (c: string) => c.replace(/^[①-⑩]\s*/, "");

// 정답 글에서 보기 번호 (없으면 null)
export const choiceMark = (answer: string | null | undefined) => answer?.trim().match(/^[①-⑩]/)?.[0] ?? null;

export function formatOf(p: { question: string; format?: ProblemFormat }): ProblemFormat {
  return p.format ?? (splitChoices(p.question).choices.length >= 2 ? "choice" : "essay");
}

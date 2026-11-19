import { chat } from "./ai";
import { findLesson, gradeName } from "./curriculum";
import { solveLinear } from "./equation";
import { generateFromTemplate, listTemplates } from "./problemBank";

// 교육과정 소단원에 맞춰 출제할 문항 초안 (저장하지 않고 교사 확인용으로 돌려준다)
//  bank: 그 소단원의 문제은행 틀에서 쉬운 것부터 돌아가며 숫자를 바꿔 생성 (정답은 풀이기로 검증)
//  ai:   AI(Solar)가 소단원 학습 내용에 맞춰 문항·정답·해설 초안 (정답을 먼저 정하고 거꾸로 만든다)
//        → 일차방정식이면 풀이기로 정답을 다시 맞추고, 아니면 AI 가 문제만 보고 다시 풀어 검산한다
//        조건이 모순인 문항·학년 범위를 벗어난 문항은 버리고 (모자라면 한 번 더 만든다),
//        검산 답만 어긋난 문항은 모자랄 때만 doubt 로 표시해 넣는다
export type UnitItem = {
  question: string;
  answer: string;
  solution: string[];
  concept: string;
  templateId?: string;
  source: "bank" | "ai";
  doubt?: string; // AI 검산이 어긋남 (검산 답·이유). 교사가 꼭 확인
  reject?: string; // 버릴 문항: 조건 모순·학년 범위 밖 (교사에게 보내지 않음)
};

// 학년별로 아직 배우지 않은 내용 (2022 개정). AI 가 자주 넘어가는 것만 적는다
const NOT_YET: Record<number, string> = {
  1: "제곱근(√)·무리수, 피타고라스 정리, 두 점 사이의 거리, 연립방정식, 일차함수·기울기, 부등식의 해 구하기, 확률",
  2: "제곱근(√)·무리수, 이차방정식, 이차함수, 삼각비",
  3: "",
  // 고1 (공통수학1·2): 고2 이후 내용
  4: "지수·로그, 삼각함수, 수열, 극한, 미분·적분, 조건부확률·확률분포·통계적 추정, 벡터·이차곡선",
};

// 코드로 거르는 학년 범위: 중1·중2 는 √(제곱근)을 아직 안 배운다
function outOfScope(grade: number, it: { question: string; answer: string; solution: string[] }): string | null {
  const text = [it.question, it.answer, ...it.solution].join(" ");
  if (grade < 3 && /√|sqrt|제곱근|루트/.test(text)) return "제곱근(√)은 중3 내용";
  if (grade < 2 && /피타고라스|두\s*점\s*사이의\s*거리|선분의\s*길이/.test(text) && /좌표평면/.test(text)) return "좌표평면 위 거리는 중2 이후 내용";
  return null;
}

export async function draftUnitProblems(grade: number, lessonId: string, count: number, mode: "bank" | "ai"): Promise<UnitItem[]> {
  const found = findLesson(grade, lessonId);
  if (!found) throw new Error("이 학년 교육과정에 없는 단원이에요.");
  const { unit, lesson } = found;
  return mode === "bank" ? fromBank(lesson.templates ?? [], lesson.name, count) : fromAi(grade, unit.name, lesson.name, lesson.desc, count);
}

async function fromBank(ids: string[], concept: string, count: number): Promise<UnitItem[]> {
  const templates = (await listTemplates()).filter((t) => ids.includes(t.id)).sort((a, b) => a.level - b.level);
  if (!templates.length) throw new Error("이 단원은 문제은행 틀이 없어요. AI로 만들거나 직접 입력해 주세요.");
  const exclude = new Set<string>();
  const items: UnitItem[] = [];
  // 틀을 쉬운 것부터 한 문항씩 돌아가며 (문항 수가 틀 수보다 적으면 쉬운 쪽과 어려운 쪽을 고르게)
  const order = count >= templates.length ? templates : spread(templates, count);
  for (let i = 0; items.length < count && i < count * 3; i++) {
    const t = order[i % order.length];
    const [g] = generateFromTemplate(t, 1, exclude);
    if (g) items.push({ question: g.question, answer: g.answer, solution: [], concept, templateId: t.id, source: "bank" });
  }
  return items;
}

// n개를 고르게 뽑기 (쉬운 것 → 어려운 것 순서 유지)
function spread<T>(xs: T[], n: number) {
  if (n <= 1) return xs.slice(0, 1);
  return Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
}

// 보충 문항: 학생이 풀이에서 틀린 단계의 개념(예: 이차방정식을 풀다 틀린 인수분해) 위주로. 소단원 출제와 같은 검산을 거친다
//  basis: 학생의 오답 풀이 (문항 : 풀이 줄 (채점 근거)). 학생 이름은 넣지 않는다
export async function draftConceptProblems(opts: { grade: number; concept: string; basis: string[]; count: number }): Promise<UnitItem[]> {
  const focus = `[학생이 틀린 풀이]
${opts.basis.join("\n") || "(없음)"}
이 학생은 위 풀이에서 '${opts.concept}' 단계를 틀렸다. 보충 문항이니 문제 전체가 '${opts.concept}' 를 직접 연습하는 문항이어야 한다 (예: 이차방정식을 풀다 인수분해를 틀렸으면 "다음 식을 인수분해하시오" 문항). 학생이 틀린 것과 같은 함정(부호, 계수, 빠뜨린 항 등)이 들어가게 만들고, 틀린 문항을 숫자만 바꿔 그대로 내지는 않는다.`;
  return fromAi(opts.grade, "보충 학습", opts.concept, `학생이 풀이에서 틀린 '${opts.concept}' 단계`, opts.count, focus);
}

async function fromAi(grade: number, unitName: string, lessonName: string, desc: string, count: number, focus = ""): Promise<UnitItem[]> {
  // 버린 문항 때문에 모자라면 한 번 더 만든다 (최대 2번)
  const items: UnitItem[] = [];
  const seen = new Set<string>();
  // AI 가 JSON 을 깨뜨려 보낸 판(복소수·행렬처럼 기호가 많은 단원에서 가끔)은 버리고 다시 만든다
  let failed: Error | null = null;
  for (let round = 0; round < 2; round++) {
    let got: UnitItem[];
    try {
      got = await aiRound(grade, unitName, lessonName, desc, count, seen, round > 0, focus);
    } catch (e) {
      failed = e as Error;
      continue;
    }
    items.push(...got.filter((it) => !it.reject));
    if (items.filter((it) => !it.doubt).length >= count) break;
  }
  if (!items.length) throw failed ?? new Error("AI가 쓸 만한 문항을 만들지 못했어요. 다시 시도해 주세요.");
  // 검산이 맞는 문항 먼저 (원래 순서 유지), 모자라면 어긋난 문항을 표시해서
  const ok = items.filter((it) => !it.doubt);
  const doubtful = items.filter((it) => it.doubt);
  return [...ok, ...doubtful]
    .slice(0, count)
    .sort((a, b) => items.indexOf(a) - items.indexOf(b));
}

async function aiRound(grade: number, unitName: string, lessonName: string, desc: string, count: number, seen: Set<string>, retry: boolean, focus = ""): Promise<UnitItem[]> {
  const notYet = NOT_YET[grade] ?? "";
  const system = `너는 ${gradeName(grade)} 수학 교사를 돕는 출제 도우미다. 2022 개정 교육과정 범위 안에서 학생이 손으로 풀이를 쓰는 과제 문항을 만든다.
규칙:
- 주어진 소단원 학습 내용 안에서만 낸다. 다음 학년 내용은 쓰지 않는다.${notYet ? `\n- ${gradeName(grade)}은 아직 다음을 배우지 않았다. 문제·정답·풀이 어디에도 쓰지 않는다: ${notYet}.` : ""}
- 문제 조건끼리 모순이 없어야 한다. 예: y좌표가 -3인 점 B(a, -3)은 x축 위에 있을 수 없으니 "x축 위에 있을 때 a는?" 같은 문제는 내지 않는다.
- 그림·그래프·도형 그림이 없어도 풀 수 있게, 필요한 조건은 글과 식으로 모두 쓴다.
- 첫 문항은 쉽게, 뒤로 갈수록 조금씩 어렵게. 같은 유형만 반복하지 않는다.
- 정답을 먼저 깔끔한 수로 정하고, 그 정답이 나오도록 거꾸로 조건을 만든다. 다 만든 뒤 정답을 문제 조건에 대입해 맞는지 확인한다.
- 정답은 짧게 (예: "x = 4", "12", "6π cm²"). 정답이 하나로 정해지는 문제만.
- solution 은 풀이 단계를 2~5줄로, 한 줄에 한 단계.
- checks 에는 정답을 문제의 조건에 대입한 검산식을 숫자로만 쓴다. 양변을 == 로 비교하고, 쓸 수 있는 것은 숫자, + - * / ^, 괄호, pi, sqrt( ) 뿐이다.
  예: 동전 문제 정답 12개 → "100*12 + 500*(20-12) == 5200", 부채꼴 넓이 50π/3 → "pi*10^2*60/360 == 50*pi/3". 조건마다 하나씩.
- 학생 이름 등 실제 인물 정보는 쓰지 않는다.${
    grade >= 4
      ? `
- 학생이 손으로 쓰기 쉬운 표기로 쓴다: 허수단위는 i, 거듭제곱은 x^2, 제곱근은 √(-9), 순열·조합은 5P2·5C2, 집합은 {1, 2, 3}, 행렬은 [[1, 2], [3, 4]].
- LaTeX($, \\sqrt, \\bar, \\frac 등)는 화면에 그대로 보이니 쓰지 않는다. 켤레복소수는 "z 의 켤레복소수" 처럼 말로 쓴다.
- 복소수·행렬·집합처럼 숫자 하나로 계산할 수 없는 검산은 checks 에 넣지 않는다 (빈 배열이면 다음 단계에서 다시 풀어 검산한다).`
      : ""
  }
- JSON만 출력: {"items": [{"question": "...", "answer": "...", "solution": ["...", "..."], "checks": ["..."]}]}`;
  const user = `[학년] ${gradeName(grade)}
[단원] ${unitName} > ${lessonName}
[학습 내용] ${desc}${focus ? `\n${focus}` : ""}
문항 ${count + 2}개를 만들어라.${retry ? "\n앞에서 만든 문항과 겹치지 않게, 조건이 모순되지 않고 학년 범위 안인 문항만." : ""}`;
  let parsed: { items?: { question?: unknown; answer?: unknown; solution?: unknown; checks?: unknown }[] };
  try {
    parsed = JSON.parse((await chat(system, user, 0.7)).match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  } catch (e) {
    throw new Error(`AI가 문항을 만들지 못했어요. 잠시 후 다시 시도해 주세요. (${(e as Error).message.slice(0, 80)})`);
  }
  const items: UnitItem[] = [];
  const solved = new Set<UnitItem>(); // 풀이기로 정답을 맞춘 문항 (검산 불필요)
  for (const it of parsed.items ?? []) {
    const question = String(it.question ?? "").trim();
    const key = question.replace(/\s/g, "");
    if (!question || seen.has(key)) continue;
    seen.add(key);
    let answer = String(it.answer ?? "").trim();
    let solution = Array.isArray(it.solution) ? it.solution.map(String).filter(Boolean) : [];
    // 식만 있는 일차방정식이면 풀이기 정답·해설로 바꾼다 (AI 계산 실수 방지)
    let checked = false;
    try {
      const s = solveLinear(question);
      answer = s.answer;
      solution = s.steps;
      checked = true;
    } catch {
      // 일차방정식이 아니면 아래 AI 검산
    }
    if (!answer) continue;
    const item: UnitItem = { question, answer, solution, concept: lessonName, source: "ai" };
    const scope = outOfScope(grade, item);
    if (scope) {
      item.reject = scope;
      items.push(item);
      continue;
    }
    // 대입 검산식을 코드로 계산 (AI 가 계산을 틀려도 잡힌다)
    if (!checked) {
      const bad = (Array.isArray(it.checks) ? it.checks.map(String) : []).find((c) => checkHolds(c) === false);
      if (bad) item.doubt = `대입 검산이 맞지 않아요 (${bad})`;
    }
    items.push(item);
    if (checked) solved.add(item);
  }
  await crossCheck(grade, items.filter((it) => !solved.has(it) && !it.reject));
  return items;
}

// AI 검산: 처음 정답을 보여 주지 않고 문제만 다시 풀게 한다 (정답을 보여 주면 거기에 맞춰 버림)
//  → 두 답에 나온 숫자를 비교. 다르면 doubt, 숫자가 없는 답(말로 된 답)은 판단하지 않는다
//  검산 쪽도 조건이 모순되는 문제(답이 없거나 여러 개)를 찾으면 doubt
async function crossCheck(grade: number, items: UnitItem[]) {
  if (!items.length) return;
  const system = `너는 ${gradeName(grade)} 수학 문제를 처음 보는 학생처럼 직접 푸는 검산 도우미다.
규칙:
- 각 문제를 처음부터 식을 세워 직접 계산한다. 계산 과정을 work 에 짧게 쓰고, 마지막에 구한 답을 answer 에 쓴다.
- 구한 답을 문제의 모든 조건에 다시 대입해 확인한다. 조건이 서로 맞지 않거나 답이 없거나 여러 개면 problem 에 이유를 쓴다 (문제없으면 빈 문자열).
- ${gradeName(grade)}이 아직 배우지 않은 내용${NOT_YET[grade] ? ` (${NOT_YET[grade]})` : ""}이 있어야 풀리면 problem 에 "학년 범위 밖: 이유"를 쓴다.
- JSON만 출력: {"results": [{"no": 1, "work": "...", "answer": "...", "problem": ""}]}`;
  const user = items.map((it, i) => `${i + 1}. ${it.question}`).join("\n");
  try {
    const parsed = JSON.parse((await chat(system, user, 0)).match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      results?: { no?: unknown; answer?: unknown; problem?: unknown }[];
    };
    for (const r of parsed.results ?? []) {
      const it = items[Number(r.no) - 1];
      if (!it || it.doubt || it.reject) continue;
      const theirs = String(r.answer ?? "");
      // 조건 모순·학년 범위 밖은 교사에게 보내지 않고 버린다
      if (String(r.problem ?? "").trim()) it.reject = String(r.problem).trim();
      else if (sameNumbers(it.answer, theirs) === false) it.doubt = `다시 풀어 보니 ${theirs}`;
    }
  } catch {
    // 검산 호출이 실패하면 표시 없이 둔다 (AI 초안 확인 안내는 그대로)
  }
}

// 두 답에 나온 숫자가 같은지 ("어른 8000원, 학생 4000원" vs "8000, 4000" → 같음). 한쪽이라도 숫자가 없으면 null
export function sameNumbers(a: string, b: string): boolean | null {
  // 둘 다 계산되는 식이면 값으로 ("2² × 3²" vs "36")
  const value = (t: string) => evalArith(t.replace(/²/g, "^2").replace(/³/g, "^3").replace(/^\s*[a-zA-Z]\s*=\s*/, ""));
  const va = value(a), vb = value(b);
  if (va !== null && vb !== null) return Math.abs(va - vb) < 1e-6 * Math.max(1, Math.abs(va));
  const nums = (t: string) =>
    (t.replace(/,(?=\d{3})/g, "").replace(/[²³]/g, "").match(/-?\d+(\.\d+)?/g) ?? []).map(Number).sort((x, y) => x - y);
  const x = nums(a), y = nums(b);
  if (!x.length || !y.length) return null;
  // 단위·번호처럼 한쪽에만 붙은 숫자는 무시: 적은 쪽 숫자가 모두 많은 쪽에 있으면 같음
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  const pool = [...big];
  return small.every((n) => {
    const k = pool.findIndex((m) => Math.abs(m - n) < 1e-6);
    if (k < 0) return false;
    pool.splice(k, 1);
    return true;
  });
}

// 검산식 "좌변 == 우변" 계산. 맞으면 true, 틀리면 false, 읽을 수 없는 식이면 null (판단하지 않음)
export function checkHolds(expr: string): boolean | null {
  const sides = expr.split("==");
  if (sides.length !== 2) return null;
  const [l, r] = sides.map(evalArith);
  if (l === null || r === null) return null;
  return Math.abs(l - r) <= 1e-6 * Math.max(1, Math.abs(l), Math.abs(r));
}

// 숫자 · + - * / ^ · 괄호 · pi · sqrt() 만 읽는 계산기 (eval 을 쓰지 않는다)
export function evalArith(src: string): number | null {
  const s = src.replace(/π/g, "pi").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = s[i++] === "+" ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (peek() === "*" || peek() === "/") v = s[i++] === "*" ? v * unary() : v / unary();
    return v;
  };
  // -3^2 = -(3^2) = -9
  const unary = (): number => {
    if (peek() === "-") return i++, -unary();
    if (peek() === "+") return i++, unary();
    return power();
  };
  const power = (): number => {
    const b = atom();
    if (peek() === "^") {
      i++;
      return b ** unary();
    }
    return b;
  };
  const atom = (): number => {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (s[i++] !== ")") throw new Error("괄호");
      return v;
    }
    if (s.startsWith("pi", i)) return (i += 2), Math.PI;
    if (s.startsWith("sqrt(", i)) {
      i += 5;
      const v = expr();
      if (s[i++] !== ")") throw new Error("괄호");
      return Math.sqrt(v);
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("숫자");
    i += m[0].length;
    return Number(m[0]);
  };
  try {
    const v = expr();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

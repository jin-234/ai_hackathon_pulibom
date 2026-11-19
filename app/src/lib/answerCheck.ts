// 답안 칸에 쓴 답을 문항 정답과 비교한다 (제출할 때 서버에서 바로 채점)
// - 공백·대소문자·×·−·： 모양 차이는 무시
// - "x = 3" ↔ "3" 처럼 등호 오른쪽만 같아도 정답
// - "3/4" ↔ "0.75" 처럼 값이 같으면 정답
// - "96" ↔ "96 cm²" 처럼 단위만 빠져도 정답
// 답안 칸이 비었거나 문항에 정답이 없으면 비교할 수 없어 null
import { choiceMarks } from "./problemFormat";

const UNIT = /(?:cm|mm|km|kg|ml|m|g|l|개|원|명|초|분|시간|도|°|점|살|권|장|번|%)(?:\^?[23²³])?$/;

function normalize(s: string) {
  return s
    .normalize("NFKC") // 전각 글자(：＝ 등)를 보통 글자로
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[×✕·]/g, "*")
    .replace(/[−–—]/g, "-")
    .replace(/÷/g, "/")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1"); // 천 단위 쉼표 (1,000원 = 1000원, 답 사이 쉼표가 아님)
}

// 등호 오른쪽 (x=3 → 3)
const rhs = (s: string) => (s.includes("=") ? s.slice(s.lastIndexOf("=") + 1) : s);
const stripUnit = (s: string) => s.replace(UNIT, "");

// 숫자로 읽을 수 있으면 값 (3, -2, 0.75, 3/4, -3/4)
function valueOf(s: string): number | null {
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const v = m[2] === undefined ? Number(m[1]) : Number(m[1]) / Number(m[2]);
  return Number.isFinite(v) ? v : null;
}

function forms(s: string) {
  const n = normalize(s);
  return [...new Set([n, rhs(n), stripUnit(n), stripUnit(rhs(n))])].filter(Boolean);
}

// 객관식 번호 (① ~ ⑩ 중 맨 앞 글자)
const CHOICE = /^[①-⑩]/;

export function checkAnswer(answerText: string | null | undefined, expected: string | null | undefined): boolean | null {
  if (!answerText?.trim() || !expected?.trim()) return null;
  // 객관식: 정답이 "③ (x - 2)(x + 2)" 처럼 번호로 시작하면 번호만 비교 ("③", "③ (x-2)(x+2)" 모두 정답).
  //  정답이 여러 개("② …, ④ …")면 고른 번호들이 정답 번호들과 똑같아야 정답 (하나라도 빠지거나 더 고르면 오답)
  if (CHOICE.test(expected.trim()) && CHOICE.test(answerText.trim())) {
    const ce = choiceMarks(expected);
    const ca = choiceMarks(answerText);
    return ce.length === ca.length && ce.every((m) => ca.includes(m));
  }
  // 답이 여러 개 (근이 두 개 등): 값의 집합으로 비교 — 개수와 값이 모두 같아야 정답, 순서는 상관없음
  const ma = answers(answerText);
  const mb = answers(expected);
  if (ma.length > 1 || mb.length > 1) return ma.length === mb.length && ma.every((x) => mb.some((y) => same(x, y))) && mb.every((y) => ma.some((x) => same(x, y)));
  return same(answerText, expected);
}

// 답 하나끼리 같은지 (등호 오른쪽·단위·값이 같은 꼴까지)
function same(answer: string, expected: string) {
  const a = forms(answer);
  const b = forms(expected);
  for (const x of a)
    for (const y of b) {
      if (x === y) return true;
      const vx = valueOf(x);
      const vy = valueOf(y);
      if (vx !== null && vy !== null && Math.abs(vx - vy) < 1e-9) return true;
    }
  return false;
}

// 여러 답으로 나누기: '또는'·'혹은'·쉼표로 (괄호 안 쉼표는 순서쌍이라 그대로), '±' 는 + 와 - 둘로.
//  'x=2 또는 x=3' · 'x=2, 3' · '2, 3' → ['2', '3'] (미지수가 하나면 'x=' 는 뗀다). 'x=2, y=3' 처럼 문자가 다르면 그대로 둔다
function answers(text: string): string[] {
  const t = normalize(text).replace(/또는|혹은|이거나|그리고|및|\bor\b/g, ",");
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of t) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const items = parts.filter(Boolean).flatMap((p) => (p.includes("±") ? [p.replace("±", "+"), p.replace("±", "-")] : [p])).map((p) => p.replace(/=\+/, "=").replace(/^\+/, ""));
  const vars = new Set(items.map((p) => p.match(/^([a-z])=/)?.[1]).filter(Boolean));
  return vars.size <= 1 ? items.map((p) => p.replace(/^[a-z]=/, "")) : items;
}

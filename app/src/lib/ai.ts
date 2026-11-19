import type { Analysis, ErrorType, Problem } from "./types";
import { ERROR_LABEL, LOW_OCR_CONFIDENCE, variableOf } from "./types";

export { variableOf };
import { env } from "./env";
import { linearForm, solveLinear } from "./equation";

// AI 호출 모음. 모델은 .env 로 교체 가능하게 둔다.
//   ANALYSIS_BASE_URL / ANALYSIS_MODEL / ANALYSIS_API_KEY 를 바꾸면
//   OpenAI 호환 서버(예: 나중에 vLLM으로 띄운 EXAONE 4.5)로 바로 교체된다.

const UPSTAGE_KEY = () => env("UPSTAGE_API_KEY") ?? "";
const OCR_URL = () => env("UPSTAGE_OCR_URL") ?? "https://api.upstage.ai/v1/document-digitization";
const BASE_URL = () => env("ANALYSIS_BASE_URL") ?? "https://api.upstage.ai/v1";
const MODEL = () => env("ANALYSIS_MODEL") ?? "solar-pro4";
const ANALYSIS_KEY = () => env("ANALYSIS_API_KEY") || UPSTAGE_KEY();

export function hasUpstageKey() {
  return UPSTAGE_KEY().length > 0;
}

type OcrWord = { text: string; confidence: number; boundingBox?: { vertices: { x: number; y: number }[] } };

// ① 업스테이지 Document OCR: 손글씨 풀이 이미지 → 줄 단위 텍스트 + 줄별 신뢰도(가장 낮은 단어 기준)
//    bands(이미지 안 줄 위치)를 주면 단어를 그 줄에 배정하고(단어가 없는 줄은 '', 신뢰도 0 으로 자리를 남김),
//    없으면 단어 위치로 줄을 추정한다.
export async function runOcr(
  png: Buffer,
  bands?: { top: number; bottom: number }[],
  v = "x", // 이 문항의 미지수 (normalizeMath 에서 이 글자로 맞춘다)
): Promise<{ lines: string[]; confidences: number[]; raw: unknown }> {
  const form = new FormData();
  form.append("document", new Blob([new Uint8Array(png)], { type: "image/png" }), "solution.png");
  form.append("model", "ocr");
  const res = await fetch(OCR_URL(), {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTAGE_KEY()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OCR 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = (await res.json()) as { text?: string; pages?: { words?: OcrWord[] }[] };
  const words = (raw.pages ?? []).flatMap((p) => p.words ?? []).filter((w) => w.text.trim() && w.boundingBox?.vertices?.length);
  if (bands?.length) {
    const grouped = assignWordsToBands(words, bands);
    return { lines: grouped.map((g) => normalizeMath(g.text, v)), confidences: grouped.map((g) => g.confidence), raw };
  }
  if (words.length) {
    const grouped = groupWordsIntoLines(words);
    return { lines: grouped.map((g) => normalizeMath(g.text, v)), confidences: grouped.map((g) => g.confidence), raw };
  }
  const lines = (raw.text ?? "")
    .split("\n")
    .map((l) => normalizeMath(l.trim(), v))
    .filter(Boolean);
  return { lines, confidences: lines.map(() => 1), raw };
}

function wordBoxes(words: OcrWord[]) {
  return words.map((w) => {
    const ys = w.boundingBox!.vertices.map((v) => v.y);
    const xs = w.boundingBox!.vertices.map((v) => v.x);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { w, left: Math.min(...xs), cy: (top + bottom) / 2, h: bottom - top };
  });
}

// 줄 안에서는 왼쪽부터 잇는다.
// 공백 없이 잇는다: '3','6' 처럼 한 수가 쪼개져 나와도 '36' 으로 (수식이라 공백은 의미 없음)
function joinLine(items: ReturnType<typeof wordBoxes>) {
  if (items.length === 0) return { text: "", confidence: 0 };
  items.sort((a, b) => a.left - b.left);
  return { text: items.map((i) => i.w.text.trim()).join(""), confidence: Math.min(...items.map((i) => i.w.confidence)) };
}

// 획으로 나눈 줄 위치에 단어를 배정한다 (단어 중심이 들어가는 줄, 없으면 가장 가까운 줄)
function assignWordsToBands(words: OcrWord[], bands: { top: number; bottom: number }[]) {
  const buckets = bands.map(() => [] as ReturnType<typeof wordBoxes>);
  for (const b of wordBoxes(words)) {
    let best = 0;
    let bestDist = Infinity;
    bands.forEach((band, i) => {
      const d = b.cy < band.top ? band.top - b.cy : b.cy > band.bottom ? b.cy - band.bottom : 0;
      if (d < bestDist) [best, bestDist] = [i, d];
    });
    buckets[best].push(b);
  }
  return buckets.map(joinLine);
}

// 단어 박스의 세로 위치로 줄을 묶는다 (줄마다 신뢰도를 알기 위해 text 대신 words 사용)
function groupWordsIntoLines(words: OcrWord[]) {
  const boxes = wordBoxes(words);
  boxes.sort((a, b) => a.cy - b.cy);
  const lines: { cy: number; h: number; items: typeof boxes }[] = [];
  for (const b of boxes) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(b.cy - line.cy) < Math.max(line.h, b.h) / 2) {
      line.items.push(b);
      line.cy = line.items.reduce((s, i) => s + i.cy, 0) / line.items.length;
      line.h = Math.max(line.h, b.h);
    } else lines.push({ cy: b.cy, h: b.h, items: [b] });
  }
  return lines.map((l) => joinLine(l.items));
}

// 미지수 글자로 맞춘다. x 일 때: 곱셈 기호 대신 문자 x 를 쓰므로 OCR 이 × 로 읽은 것을 되돌리고,
// 'ɔc' 모양으로 쓴 x 가 ')(' 로 읽힌 것은 괄호 짝이 안 맞을 때만 x 로 바꾼다 ('(x+1)(x-2)' 같은 진짜 괄호는 그대로).
// 다른 글자일 때: 대문자로 읽힌 것만 소문자로 ('5Y' → '5y'). × 는 곱셈일 수 있으니 그대로 둔다.
// 문자가 없는 계산 문항(v = ""): × 는 곱셈 기호 그대로.
function normalizeMath(line: string, v = "x") {
  let s = line.replace(/[−–—]/g, "-");
  if (v === "x") {
    s = s.replace(/[×✕✗χX]/g, "x");
    if (s.includes(")(") && !parensBalanced(s)) s = s.replace(/\)\(/g, "x");
  } else if (v) s = s.split(v.toUpperCase()).join(v);
  if (!v) return s;
  // 분수 옆 글자 하나짜리 괄호는 뗀다: '(x)/2' → 'x/2' ('3(2)' 같은 곱셈 괄호는 그대로)
  const one = new RegExp(`\\(([0-9]+|${v})\\)(?=\\/)`, "g");
  const after = new RegExp(`(?<=\\/)\\(([0-9]+|${v})\\)`, "g");
  return s.replace(one, "$1").replace(after, "$1");
}

function parensBalanced(s: string) {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

// ② Solar Pro 로 OCR 오인식 보정
//    정답·해설·문제 식을 일부러 주지 않는다. 주면 학생이 쓰지 않은 식을 베껴 넣는다.
//    fractions: 줄마다 획에서 찾은 분수 개수. '/' 가 모자란 줄은 깨끗해 보여도 보정 대상이다 ('x/2=3' → 'x12=3').
// 방정식 문항인데 x 가 없는 줄 ('2=3', '22=8', '50=5'): OCR 이 x 를 모양이 비슷한 숫자로 읽은 것.
// 왼쪽 변 끝 글자가 x 와 헷갈리는 숫자(2·7·9·0)면 x 로 되돌린다 ('2=3' → 'x=3', '22=8' → '2x=8').
// x 가 없는 등식은 일차방정식 풀이에 나올 수 없으므로 학생 풀이를 '맞게' 고치는 것이 아니다.
export function restoreMissingX(line: string): string {
  if (line.includes("x") || (line.match(/=/g) ?? []).length !== 1) return line;
  const m = line.match(/^(-?)(\d*)([0279])(=-?[\d/]+)$/);
  return m ? `${m[1]}${m[2]}x${m[4]}` : line;
}

export async function correctOcr(ocrLines: string[], fractions: number[] = [], isEquation = false, v = "x"): Promise<string[]> {
  const fixed = await correctOcrLines(ocrLines, fractions, v);
  // x 가 숫자로 읽힌 줄 되돌리기는 x 문항만 (다른 글자는 숫자와 헷갈리는 모양이 다르다)
  if (!isEquation || v !== "x") return fixed;
  return fixed.map((l) => {
    const r = restoreMissingX(l.replace(/\s/g, ""));
    return r === l.replace(/\s/g, "") ? l : r;
  });
}

// 손글씨 미지수를 OCR 이 무엇으로 잘못 읽는지 (보정 프롬프트에 넣는다)
const LOOKALIKE: Record<string, string> = {
  x: `한국 학생은 x를 'ɔc'처럼 두 획으로 써서 OCR이 x를 '7c', '2c', 'c', 'つ', 'つし', 'つく', 'ㄱ', 'ㄴ', 'ㄱㄴ', 'ン', 'X', '×', 'χ' 등으로 읽는다.
계수와 붙으면 '2x'가 '27c', '22', '2つし', '52', '02' 처럼 보이기도 한다. x를 ')(', '>(', 'λ'로 읽기도 한다.`,
  y: `y 를 'Y', 'γ', 'ㅛ', 'ㄲ', 'g', 'q', '4', '9', 'λ', 'u' 등으로 읽는다. 계수와 붙으면 '5y'가 '54', '59', '5Y' 처럼 보이기도 한다.`,
  a: `a 를 'α', 'ɑ', 'd', 'o', 'O', '0', '9', 'Q', 'ㅇ' 등으로 읽는다. 계수와 붙으면 '2a'가 '20', '29', '2d' 처럼 보이기도 한다.`,
  b: `b 를 '6', 'h', 'lo', 'B', 'ㅂ' 등으로 읽는다. 특히 숫자 6 과 헷갈린다: 계수와 붙은 '3b'가 '36' 으로, 'b=4' 가 '6=4' 로 읽힌다.`,
  m: `m 을 'rn', 'nn', 'M', 'ㅠ', 'ᆷ', 'w' 등으로 읽는다.`,
  n: `n 을 'h', 'u', 'r', 'N', 'ㅅ', 'ㄴ', 'η', 'v' 등으로 읽는다.`,
  i: `i 를 '1', 'l', 'I', '|', 'j', '!', 'ì', 'ㅣ' 등으로 읽는다. 계수와 붙으면 '2i'가 '21' 처럼 보이기도 한다.`,
};

async function correctOcrLines(ocrLines: string[], fractions: number[], v: string): Promise<string[]> {
  const system = `너는 손글씨 수식 OCR 결과의 글자 오인식만 고치는 교정기다. 내용은 중학교 수학 풀이다: 일차방정식, 정수·분수 계산, 문자식 간단히 하기, □ 구하기.
${
    v
      ? `이 문항의 미지수(문자)는 ${v} 하나뿐이다. 다른 영문자로 바꾸지 말고, 문자로 보이는 것은 ${v} 로 쓴다.\n${LOOKALIKE[v] ?? LOOKALIKE.x}`
      : "이 문항은 문자가 없는 계산 문항이다. × 는 곱셈, ÷ 는 나눗셈 기호다. 영문자로 보이는 것은 숫자나 기호를 잘못 읽은 것이다."
  }
그 밖에 '8'→'吕'/'B', '1'→'l'/'|', '='→'二'/'ニ'/'-', '-'가 빠짐.
규칙:
- 글자 하나하나를 모양이 비슷한 기호로 바꾸는 것만 한다. 항을 새로 만들거나, 숫자를 계산해서 바꾸거나, 식을 맞게 고치지 않는다.
- OCR에 있는 숫자는 최대한 그대로 둔다. ${v === "x" ? "예: '27c=113' → '2x=11-3' 또는 '2x=113'" : `숫자를 ${v} 로 바꾸는 것은 그 숫자가 들어갈 자리에 ${v} 가 없으면 식이 성립하지 않을 때만 한다`} (판단 불가 부분은 ?)
- 각 줄은 보통 '좌변 = 우변' 한 개의 등식이거나 계산식이다. 줄 수와 순서를 그대로 유지한다.
- 분수는 '${v}/2', '(${v}+1)/3' 처럼 '/' 로 쓴다. [분수 n개] 표시가 있는 줄은 '/' 를 그 개수만큼 되살린다 (보통 '1'·'l'·'|' 가 '/' 였다).
- 확신이 없는 글자는 '?'로 둔다.
- JSON만 출력: {"lines": ["...", "..."]}`;
  const needsSlash = (l: string, i: number) => (l.match(/\//g)?.length ?? 0) < (fractions[i] ?? 0);
  const clean = (l: string, i: number) => isCleanLine(l, v) && !needsSlash(l, i);
  if (ocrLines.every(clean)) return ocrLines;
  const user = `OCR 결과 (${ocrLines.length}줄):\n${ocrLines
    .map((l, i) =>
      [
        l,
        needsSlash(l, i) ? `[원래 손글씨에 분수 ${fractions[i]}개: '/' 가 '1'·'l'·'|' 로 읽혔거나 빠졌을 수 있음]` : "",
      ]
        .filter(Boolean)
        .join("    "),
    )
    .join("\n")}`;
  try {
    const text = await chat(system, user, 0);
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { lines?: unknown[] };
    const lines = Array.isArray(parsed.lines) ? parsed.lines.map((l) => normalizeMath(String(l), v)) : [];
    if (lines.length !== ocrLines.length) return ocrLines;
    // 안전장치: AI가 학생 풀이를 '맞게' 고쳐 버리는 것을 코드로 막는다
    return ocrLines.map((raw, i) => (clean(raw, i) || !digitsPreserved(raw, lines[i]) ? raw : lines[i]));
  } catch {
    return ocrLines;
  }
}

// 미지수가 들어 있고 숫자·연산기호만 있으며 등호가 하나인 줄은 이미 제대로 읽힌 것으로 보고 손대지 않는다
function isCleanLine(line: string, v = "x") {
  return new RegExp(`^[0-9${v}+\\-=().\\s/]+$`).test(line) && (line.match(/=/g) ?? []).length === 1 && line.includes(v);
}

// 보정 결과의 숫자가 OCR 숫자(모양이 비슷한 글자 포함)에 순서대로 들어 있어야 한다.
// 예: '27c=113' → '2x=11-3' 은 통과, '2x+3=11' 처럼 없던 숫자가 생기면 실패
function digitsPreserved(raw: string, fixed: string) {
  const src = raw.replace(/[吕B]/g, "8").replace(/[lI|]/g, "1").replace(/[OoD]/g, "0").replace(/[Ss]/g, "5").replace(/\D/g, "");
  const out = fixed.replace(/\D/g, "");
  let j = 0;
  for (const ch of src) if (j < out.length && ch === out[j]) j++;
  return j === out.length;
}

export async function chat(system: string, user: string, temperature: number) {
  const res = await fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANALYSIS_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
    }),
  });
  if (!res.ok) throw new Error(`AI 호출 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

// 검산: 일차방정식 줄마다 해를 코드로 계산해, 앞 줄과 해가 처음 달라지는 줄(= 첫 오류 줄)을 AI 에게 알려 준다.
// AI 가 맞게 한 이항을 틀렸다고 보거나, 계산 실수를 엉뚱한 줄에서 찾는 것을 막는다. 풀 수 없는 줄은 건너뛴다
// 줄에 숫자끼리 계산이 남아 있으면(예: '-3x=1-7' 의 1-7) 그 맞는 값과 음수가 끼었는지 알려 준다.
// 다음 줄에서 이 계산을 틀렸을 때 SIGN(음수 계산)인지 ARITH(양수끼리 계산)인지 가르는 기준
function pendingCalc(line: string): string {
  const side = line.replace(/\s/g, "").split("=").find((p) => /^[\d+\-()]+$/.test(p) && /[\d)][+\-]/.test(p));
  if (!side) return "";
  try {
    const v = linearForm(`x=${side}`).b;
    const negative = v < 0 || /^-|\(-/.test(side);
    return negative
      ? ` 앞 줄의 계산 ${side} (맞는 값 ${v}) 은 음수가 낀 계산 → 이 계산을 틀린 것이면 SIGN`
      : ` 앞 줄의 계산 ${side} (맞는 값 ${v}) 은 양수끼리 계산 → 이 계산을 틀린 것이면 ARITH`;
  } catch {
    return "";
  }
}

const xCount = (line: string) => line.match(/x/g)?.length ?? 0;

function checkLines(lines: string[], variable = "x"): string[] {
  // 풀이기는 x 만 읽으므로 다른 미지수는 x 로 바꿔서 풀고, 알려 주는 글은 다시 그 글자로 쓴다
  if (!variable) return lines.map(() => ""); // 문자가 없는 계산 문항은 방정식 검산을 하지 않는다
  if (variable !== "x")
    return checkLines(lines.map((l) => (l.includes("x") ? "?" : l.split(variable).join("x"))), "x").map((n) => n.replace(/x/g, variable));
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
  let prev: { v: number; a: number; b: number; line: string } | null = null;
  return lines.map((l) => {
    let cur: { v: number; a: number; b: number; line: string };
    try {
      if (l.includes("?")) return "";
      cur = { v: solveLinear(l).answerValue, ...linearForm(l), line: l };
    } catch {
      return "";
    }
    let note = `[검산: 해 x=${fmt(cur.v)}]`;
    if (prev && Math.abs(cur.v - prev.v) < 1e-9) note = `[검산: 해 x=${fmt(cur.v)}, 앞 줄과 같음 → 이 줄로 넘어오는 과정은 맞음]`;
    else if (prev) {
      // 'Ax = B' 로 정리했을 때 어느 쪽이 바뀌었는지 (양변을 나눈 줄은 둘 다 바뀌므로 해만 알린다)
      const side =
        cur.b === prev.b && cur.a !== prev.a
          ? ` (모두 정리하면 앞 줄 ${fmt(prev.a)}x = ${fmt(prev.b)}, 이 줄 ${fmt(cur.a)}x = ${fmt(cur.b)}: 상수항은 그대로이고 x 항 쪽이 달라짐.${xCount(cur.line) < xCount(prev.line) ? " x 항을 모으는 줄 → 계수를 잘못 더하고 뺀 것이면 LIKE_TERMS" : ""})`
          : cur.a === prev.a && cur.b !== prev.b
            ? ` (모두 정리하면 앞 줄 ${fmt(prev.a)}x = ${fmt(prev.b)}, 이 줄 ${fmt(cur.a)}x = ${fmt(cur.b)}: x 항은 그대로이고 상수항 쪽이 달라짐.${pendingCalc(prev.line)})`
            : "";
      note = `[검산: 해가 x=${fmt(prev.v)} 에서 x=${fmt(cur.v)} 로 달라짐 → 이 줄로 넘어올 때 실수${side}]`;
    }
    prev = cur;
    return note;
  });
}

// 오류 유형을 AI 가 같은 기준으로 고르도록 주는 설명 (학생별 약점 집계의 기준이 된다)
export const ERROR_GUIDE: Record<ErrorType, string> = {
  SIGN: "음수가 끼거나 답이 음수가 되는 덧셈·뺄셈·곱셈·나눗셈을 틀림: 부호를 틀리거나, 절댓값을 더할지 뺄지 헷갈림 (예: (-2) × (-3) = -6, -8 + 5 = -13, 1 - 7 = -8). 괄호 앞 - 를 풀다 틀린 것은 PAREN_SIGN, 음수를 대입하며 괄호를 빠뜨린 것은 SUBSTITUTE, x 의 계수로 나누는 단계의 부호는 DIVIDE",
  PAREN_SIGN: "괄호 앞에 - (음수)가 있을 때 괄호 안 뒤쪽 항의 부호를 바꾸지 않음 (예: -(x + 3) → -x + 3, 7 - (x - 2) → 7 - x - 2, -2(x + 3) → -2x + 6)",
  DISTRIBUTE: "괄호를 풀 때 괄호 앞 수를 일부 항에만 곱함 (예: 2(x + 3) → 2x + 3, 3(x - 2) → 3x - 2)",
  LIKE_TERMS: "x 항끼리·상수항끼리 모을 때 틀림, x 항과 상수항을 합침 (예: 3x + 2 = 5x, 5x - x = 6x). 괄호를 풀다 틀린 것은 DISTRIBUTE 나 PAREN_SIGN",
  TRANSPOSE: "등식의 성질·이항을 잘못 씀: 이항할 때 부호를 안 바꿈, 한쪽 변에만 연산함 (예: 2x + 3 = 11 → 2x = 11 + 3)",
  DIVIDE: "x 의 계수로 양변을 나눌 때 틀림: 곱하거나 빼 버림, 음수 계수로 나눌 때 부호 (예: 3x = 12 → x = 9)",
  SUBSTITUTE: "문자에 값(특히 음수)을 대입할 때 괄호를 쓰지 않아 틀림 (예: x = -2 를 x² 에 넣어 -2² = -4 로 계산, 5 - x 에 넣어 5 - 2 로 계산)",
  EXPR_MEANING: "문장을 식으로 세우거나 문자식의 뜻을 잘못 이해함 (예: 'x 의 3배보다 2 작은 수' → 3(x - 2)). 식을 맞게 세웠으면 여기가 아니다",
  CONDITION: "문제에 주어진 조건(양수, 자연수, 정수, 범위 등)을 답에 반영하지 않음 (예: 'x 는 양수'라는 조건이 있는데 음수도 답에 포함)",
  TARGET: "식과 계산은 맞는데 문제에서 묻는 값이 아닌 다른 값을 답함 (예: 사과 수를 x 로 두고 배의 개수 x + 3 을 구해야 하는데, x = 5 를 구한 뒤 5개라고 답함)",
  FRACTION: "분수 계산·통분·약분·분모 없애기에서 틀림 (예: x/2 + x/3 에서 분모를 5 로 둠)",
  ARITH: "양수끼리 계산해 양수가 나오는 단순 덧셈·뺄셈·곱셈·나눗셈 실수나 계산 순서 실수 (예: 2x = 11 - 3 다음 줄에 2x = 6, 7 × 8 = 54). 답이 음수가 되는 뺄셈(1 - 7 = -8)은 SIGN",
  FORMULA: "넓이·부피·비율 등 공식이나 개념을 잘못 적용함",
  UNREADABLE: "풀이를 거의 읽을 수 없어 판단 불가",
  NONE: "정답이고 과정에도 문제 없음",
};

// 중1 교사 설문에서 '풀이에서 잡아 주면 좋겠다'고 많이 꼽은 실수 유형 (picked: 고른 교사 수, 많이 고른 순).
// 채점(오류 유형 분류)과 학생별 약점 요약이 같은 코드·이름을 쓴다. 기준·예시는 ERROR_GUIDE 에
export const TEACHER_PICKS: { type: ErrorType; name: string; picked: number }[] = [
  { type: "CONDITION", name: "조건을 놓침", picked: 10 },
  { type: "TARGET", name: "구하는 값을 혼동함", picked: 10 },
  { type: "SIGN", name: "음수 계산에서 부호를 틀림", picked: 9 },
  { type: "DISTRIBUTE", name: "괄호를 풀 때 일부 항에만 곱함", picked: 8 },
  { type: "PAREN_SIGN", name: "괄호 앞 음수의 부호를 틀림", picked: 8 },
  { type: "SUBSTITUTE", name: "값을 대입할 때 괄호를 빠뜨림", picked: 8 },
  { type: "TRANSPOSE", name: "이항할 때 부호를 틀림", picked: 7 },
  { type: "ARITH", name: "덧셈·뺄셈 계산에서 틀림", picked: 6 },
];
const PICK_TYPES = new Set(TEACHER_PICKS.map((p) => p.type));

// ③ Solar Pro: 문제·정답·해설 + OCR 결과 → 풀이 읽기 → 오류 위치 → 채점 → 오류 유형 분류 (JSON)
export async function analyzeSolution(input: {
  problem: Problem;
  ocrLines: string[];
  ocrConfidence?: number[];
  ocrFractions?: number[];
  ocrMarks?: { line: number | null; kind: "cancel" | "strike" }[]; // 획에서 찾은 빗금 (약분 표시 · 줄을 그어 지운 흔적)
  durationSec: number;
  erases: number;
}): Promise<Analysis> {
  const { problem, ocrLines, durationSec, erases } = input;
  // 미지수 글자와 방정식 문항인지 (문장제는 정답이 'x=…' 인 것): 방정식이면 x 가 빠진 줄을 되돌릴 수 있다
  const v = variableOf(problem);
  const isEquation = !!v && ((problem.question.includes(v) && problem.question.includes("=") && !problem.free) || new RegExp(`^${v}=`).test(problem.answer.replace(/\s/g, "")));
  const correctedLines = ocrLines.length ? await correctOcr(ocrLines, input.ocrFractions, isEquation, v) : [];
  // 인식 불확실: OCR 신뢰도가 낮거나, 보정 후에도 획에서 찾은 분수만큼 '/' 가 없는 줄
  const lowConf = ocrLines.map(
    (_, i) =>
      (input.ocrConfidence?.[i] ?? 1) < LOW_OCR_CONFIDENCE ||
      (correctedLines[i]?.match(/\//g)?.length ?? 0) < (input.ocrFractions?.[i] ?? 0),
  );
  // ★: 교사들이 설문에서 꼽은 유형
  const codes = (Object.keys(ERROR_LABEL) as ErrorType[])
    .map((k) => `- ${PICK_TYPES.has(k) ? "★ " : ""}${k} (${ERROR_LABEL[k]}): ${ERROR_GUIDE[k]}`)
    .join("\n");

  const system = `너는 중학교 1학년 수학 교사를 돕는 풀이 채점·분석 도우미다.
교사가 풀이를 하나하나 다 볼 수 없으니, 네가 대신 풀이를 읽고 어디서 틀렸는지, 어떤 종류의 실수인지 분류해 둔다.
이 분류를 모아서 "누구는 뺄셈·부호가 약하고, 누구는 등식 변형이 약하다"를 파악하는 데 쓴다. 그래서 분류는 일관되고 정확해야 한다.

다음 순서대로 생각한다:
1단계 풀이 읽기: 학생 풀이를 줄마다 읽고, 앞 줄에서 다음 줄로 넘어갈 때 무엇을 했는지(이항, 동류항 정리, 양변 나누기, 계산 등) 확인한다.
2단계 오류 위치 찾기: 앞 줄과 값이 달라지는 첫 줄을 찾아 firstErrorLine 으로 둔다. 그 뒤 줄은 앞 실수를 이어받은 것이므로 새 실수로 세지 않는다.
  [검산] 표시는 프로그램이 직접 계산한 것이라 정확하다. "앞 줄과 같음"인 줄은 맞게 한 것이니 오류로 보지 않는다. "달라짐"이 처음 나온 줄이 첫 오류 줄이다.
  (이항하면 부호가 바뀐다: 3x - 5 = -8 → 3x = -8 + 5 는 맞다.)
3단계 채점: 마지막 줄의 최종 답을 정답과 비교해 correct 를 정한다.
  recognizedAnswer 에는 학생이 마지막 줄에 쓴 값을 하나도 빼거나 더하지 않고 그대로 옮긴다. 정답·해설을 보고 학생이 쓰지 않은 답을 대신 골라 주지 않는다.
  마지막 줄에 값이 여러 개 쓰여 있으면 학생은 그 값을 모두 답으로 낸 것이다. 정답에 없는 값이 섞여 있으면 오답이다 (정답이 3 인데 마지막 줄이 '3, -3', 정답이 1, 2 인데 마지막 줄이 '-1, 0, 1, 2': 조건에 맞는 값만 고르지 않았으므로 오답, CONDITION).
4단계 오류 유형 분류: 첫 오류 줄에서 학생이 실제로 무엇을 잘못했는지 보고 아래 유형 중 가장 근본 원인 하나만 고른다.
  ★ 표시는 중1 교사들이 풀이에서 꼭 잡아 달라고 꼽은 실수다. 풀이가 여기에 해당하는지 먼저 확인한다.
${codes}
5단계 근거 쓰기: reason 에 틀린 식을 인용하고 "무엇을 무엇으로 잘못 바꿨는지"를 구체적으로 쓴다 (예: "2x + 3 = 11 에서 3 을 이항할 때 부호를 바꾸지 않아 2x = 11 + 3 이 됐다").

아래 풀이는 OCR 결과를 글자 모양 기준으로 보정한 것이다. 보정이 틀렸을 수 있으니 이상하면 needsReview=true.

아래 풀이는 OCR 결과를 글자 모양 기준으로 보정한 것이다. 보정이 틀렸을 수 있으니 이상하면 needsReview=true.
학생은 답을 따로 입력하지 않고 풀이 마지막에 답(예: x = 4, 계산 결과 -7/12, 간단히 한 식 3x+4, 넓이 20)을 쓴다.
식이 아닌 계산·값 구하기 문항(혼합 계산, 소수, 비율, 넓이 등)도 나온다. 단위(cm², %)를 빼고 써도 값이 같으면 정답이다. 풀이에서 최종 답을 직접 찾아 정답과 비교한다.
값이 같으면 정답이다 (약분 전 분수·대분수·항의 순서만 다른 식 포함). 약분하지 않은 것은 정답으로 두되 suggestion 에 적는다.
규칙:
- OCR 인식 오류일 수 있으니 확신이 없으면 needsReview=true 로 둔다.
- [인식 불확실] 표시가 붙은 줄은 OCR이 부호(-)·숫자를 놓쳤을 수 있다. 그 줄에서만 보이는 오류는 학생 실수로 단정하지 말고 "인식 확인이 필요하다"고 쓰고 needsReview=true.
- reason 과 suggestion 에는 줄 번호를 쓰지 말고 해당 식을 직접 인용한다 (예: "2x = 11 + 3 에서").
- 한 문항만 보고 개념 부족을 단정하지 말고 "확인이 필요하다"는 표현을 쓴다.
- 정답이어도 중간 과정에 문제가 있으면 지적한다.
- 최종 답은 보통 마지막 줄에 있다 (예: 'x = 숫자', 계산 결과, 간단히 한 식). 답으로 볼 줄이 없거나 애매하면 recognizedAnswer=null, correct=null, needsReview=true 로 둔다.
- firstErrorLine 은 위 줄 번호(0부터)다.
- 유형 고르기: 정답이고 과정에도 문제가 없으면 NONE. 풀이가 거의 읽히지 않으면 UNREADABLE. 두 유형이 겹치면 첫 오류 줄에서 먼저 일어난 실수를 고른다 (예: 이항하면서 부호를 안 바꿨으면 TRANSPOSE, 이항은 맞게 했는데 -3 - 5 를 -2 로 계산했으면 SIGN).
- 'Ax = B' 에서 x 만 남기는 단계(계수 없애기)의 실수는 이항이 아니라 DIVIDE 다 (예: 6x = 18 → x = 18 - 6, 3x = 12 → x = 12 × 3).
- x 항끼리 모으며 계수를 잘못 더하고 뺀 것(5x - x = 6x, 3x + 2x = 6x)은 LIKE_TERMS, 숫자끼리 더하다 음수 부호를 틀린 것(-8 + 5 = -13)은 SIGN 이다.
- SIGN 과 ARITH 는 x 가 붙지 않은 숫자끼리 계산을 틀렸을 때만 쓴다 (x 항의 계수를 모으다 틀린 것은 LIKE_TERMS). 둘은 이렇게 나눈다: 틀린 계산식과 그 맞는 답을 먼저 쓴다. 계산식에 음수가 있거나 맞는 답이 음수면 SIGN 이다 (부호는 맞고 값만 틀려도 SIGN). 계산식도 맞는 답도 모두 양수일 때만 ARITH 다. [검산]에 "음수가 낀 계산" / "양수끼리 계산" / "x 항을 모으는 줄" 표시가 있으면 그대로 따른다.
  예: -3x = 1 - 7 다음 줄에 -3x = -8 → 맞는 답 -6 이 음수이므로 SIGN. (-2) × (-3) = -6 → SIGN. -8 + 5 = -13 → SIGN. 4x = -1 + 9 다음 줄에 4x = -10 → 맞는 답 8 은 양수지만 계산식에 음수 -1 이 있으므로 SIGN. 2x = 11 - 3 다음 줄에 2x = 6 → 맞는 답 8 이 양수이므로 ARITH. 15 + 9 = 23 → ARITH.
- 괄호를 푸는 줄의 실수: 괄호 앞 수를 뒤쪽 항에 곱하지 않았으면 DISTRIBUTE (2(x + 3) → 2x + 3), 괄호 앞이 음수인데 뒤쪽 항의 부호를 바꾸지 않았으면 PAREN_SIGN (-(x + 3) → -x + 3, 7 - (x - 2) → 7 - x - 2).
- 문자에 값을 넣는 줄에서 괄호 없이 넣어 틀렸으면 SUBSTITUTE 다 (x = -2 일 때 x² 을 -2² = -4 로, 5 - x 를 5 - 2 로). 그 뒤 계산이 맞아도 SIGN 이 아니다.
- 식과 계산이 끝까지 맞는데 최종 답이 정답과 다르면 문제를 다시 읽는다: 주어진 조건(양수·자연수·범위 등)에 맞지 않는 값까지 답했으면 CONDITION, 묻는 값이 아닌 값을 답했으면 TARGET (x 만 구하고 문제가 묻는 x + 3 을 구하지 않음), 식 자체를 잘못 세웠으면 EXPR_MEANING. 이때 firstErrorLine 은 답을 쓴 마지막 줄이다.
- 반드시 JSON 하나만 출력한다.`;

  const checks = checkLines(correctedLines, v);
  const user = `[문제] ${problem.question}
[정답] ${problem.answer || "(교사 미입력: 문제를 직접 풀어서 판단하고, 확신이 없으면 needsReview=true)"}
[교사 검토 해설]
${problem.solution.length ? problem.solution.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(없음)"}
[관련 개념] ${problem.concept || "(미지정)"}

[학생 풀이 (줄 번호: 보정된 식  /  OCR 원문)]
${ocrLines.length ? ocrLines.map((l, i) => `${i}: ${correctedLines[i]}  /  ${l}${lowConf[i] ? "  [인식 불확실]" : ""}${markNote(input.ocrMarks, i)}${checks[i] ? `  ${checks[i]}` : ""}`).join("\n") : "(인식된 내용 없음)"}${markSummary(input.ocrMarks)}
${ocrLines.length ? `[학생이 답으로 쓴 마지막 줄] ${correctedLines[ocrLines.length - 1]}  (이 줄에 쓰인 값 전체가 학생의 답이다. 이 중 일부만 골라서 채점하지 않는다)\n` : ""}[풀이 시간] ${durationSec}초, [지운 횟수] ${erases}회 (참고용, 이것만으로 이해도를 판단하지 말 것)

다음 형식의 JSON으로 답하라:
{"recognizedAnswer": "풀이에서 찾은 최종 답 (예: x=4) 또는 null", "correct": true|false|null, "firstErrorLine": 줄번호 또는 null, "errorType": "4단계에서 고른 코드", "concept": "관련 개념", "reason": "어디서 무엇을 잘못했는지 (틀린 식 인용, 2문장 이내)", "suggestion": "교사가 학생에게 해볼 확인 질문 또는 보충 지도 방향 (2문장 이내)", "needsReview": true|false}`;

  const res = await fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANALYSIS_KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0, // 같은 풀이면 같은 채점·오류 유형 (학생별 약점 집계의 기준)
    }),
  });
  if (!res.ok) throw new Error(`분석 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
  const text = data.choices?.[0]?.message?.content ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`분석 결과에서 JSON을 찾지 못함: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as Partial<Analysis>;
  const errorType = (parsed.errorType && parsed.errorType in ERROR_LABEL ? parsed.errorType : "UNREADABLE") as ErrorType;
  const firstErrorLine = typeof parsed.firstErrorLine === "number" ? parsed.firstErrorLine : null;
  return {
    correctedLines,
    recognizedAnswer: typeof parsed.recognizedAnswer === "string" && parsed.recognizedAnswer.trim() ? parsed.recognizedAnswer.trim() : null,
    correct: typeof parsed.correct === "boolean" ? parsed.correct : null,
    firstErrorLine,
    errorType,
    concept: parsed.concept || problem.concept,
    reason: parsed.reason ?? "",
    suggestion: parsed.suggestion ?? "",
    needsReview:
      Boolean(parsed.needsReview) ||
      ocrLines.length === 0 ||
      !parsed.recognizedAnswer ||
      correctedLines.some((l) => l.includes("?")) ||
      // 오류로 지목한 줄이나 답 줄을 OCR이 확신 없이 읽었으면 교사 확인으로 돌린다
      (firstErrorLine !== null && Boolean(lowConf[firstErrorLine])) ||
      Boolean(lowConf[ocrLines.length - 1]),
    model: data.model ?? MODEL(),
  };
}

// 빗금 안내: 약분 표시는 빗금 친 수끼리 약분한 것(그 줄의 식은 약분 전 모습), 지운 흔적은 그어 지운 부분을 이미 뺀 것
function markNote(marks: AnalyzeMarks, i: number) {
  const here = (marks ?? []).filter((m) => m.line === i);
  if (!here.length) return "";
  const cancel = here.filter((m) => m.kind === "cancel").length;
  const strike = here.length - cancel;
  return [
    cancel ? `  [약분 표시: 이 줄의 수 위에 빗금 ${cancel}개. 학생이 빗금 친 수끼리 약분한 것이니, 식은 약분 전 모습이다]` : "",
    strike ? `  [지운 흔적: 이 줄에서 학생이 줄을 그어 지운 부분은 이미 뺐다]` : "",
  ].join("");
}
function markSummary(marks: AnalyzeMarks) {
  const unknown = (marks ?? []).filter((m) => m.line === null);
  if (!unknown.length) return "";
  const cancel = unknown.filter((m) => m.kind === "cancel").length;
  return `\n[풀이 어딘가에 ${cancel ? `약분 빗금 ${cancel}개` : ""}${cancel && unknown.length > cancel ? ", " : ""}${unknown.length > cancel ? `줄을 그어 지운 흔적 ${unknown.length - cancel}개` : ""}가 있다. 약분은 학생이 약분한 것, 지운 부분은 이미 뺐다]`;
}
type AnalyzeMarks = { line: number | null; kind: "cancel" | "strike" }[] | undefined;


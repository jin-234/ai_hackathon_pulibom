import { runClaude } from "./claudeCli";
import { env } from "./env";
import { LOW_OCR_CONFIDENCE, OCR_ALLOWED, falseNumberEquation } from "./types";

// OCR 이 제대로 못 읽은 풀이를 Claude(Claude Code 헤드리스, claude -p)가 이미지를 보고 다시 읽는다.
//   흐름: 업스테이지 OCR → 확신 없는 줄 고르기(suspectLines) → Claude 가 이미지를 보고 다시 읽기 → 채점(Claude)
//   제출 채점 경로에서는 Gemini·Solar 를 쓰지 않는다. Claude 호출이 실패하면 아무것도 바꾸지 않는다 (OCR 결과 그대로).
//   VISION_MODEL: Claude 모델 (기본 sonnet, 쉼표로 여러 개면 앞 모델이 실패할 때 다음 모델)
//   (이 레포 추가) MATHPIX_APP_ID·MATHPIX_APP_KEY 가 있으면 이미지 전체 다시 읽기(full)에서 Claude 보다 먼저 Mathpix OCR 로 읽고,
//   그 결과에 확신 없는 줄이 없을 때만 쓴다. 키가 없으면 이 단계는 건너뛴다
const MODELS = () =>
  (env("VISION_MODEL") ?? "sonnet")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
export const VISION_MODEL = () => MODELS().join(",");
// 다시 읽는 방식: full = 확신 없는 줄이 있으면 이미지 전체를 처음부터 다시 읽어 풀이를 통째로 바꿈 (줄 나누기 오류도 고침)
//                lines = 확신 없는 줄만 잘라서 다시 읽음
export type VisionMode = "full" | "lines";
export const VISION_MODE = (): VisionMode => (env("VISION_MODE") === "lines" ? "lines" : "full");
// LLM 이 다시 읽은 줄의 신뢰도: 불확실 기준(LOW_OCR_CONFIDENCE)보다 조금 위.
// 채점 단계가 '인식 불확실'로 보지는 않지만, 완전히 믿을 만한 값(1)도 아니다.
export const VISION_CONFIDENCE = 0.75;

// VISION=off 로만 끈다 (claude 가 없으면 호출이 실패해 OCR 결과 그대로)
export function hasVision() {
  return env("VISION") !== "off";
}

// 확신 없는 줄 번호: 비었거나, 신뢰도가 낮거나, 수식에 없는 글자(つし·次 등)나 미지수가 아닌 영문자가 섞였거나,
// 획에서 찾은 분수보다 '/' 가 적거나, 미지수 문항인데 '2=4' 처럼 성립하지 않는 숫자 등식인 줄 (x 를 숫자로 읽음)
export function suspectLines(lines: string[], confidences: number[], fractions: number[], v = "x"): number[] {
  const anyEquals = lines.some((l) => l.includes("="));
  return lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => {
      const t = line.replace(/\s/g, "");
      if (!t) return true;
      if ((confidences[i] ?? 1) < LOW_OCR_CONFIDENCE) return true;
      if (!OCR_ALLOWED.test(t)) return true;
      if ((t.match(/[a-zA-Z]+/g) ?? []).some((w) => w.toLowerCase() !== v.toLowerCase())) return true;
      if ((t.match(/\//g)?.length ?? 0) < (fractions[i] ?? 0)) return true;
      if (v && falseNumberEquation(t)) return true;
      // 모양이 이상한 식: '==', '=' 로 시작·끝, 연산자로 끝남
      if (/==|^=|=$|[+\-*/=]$/.test(t)) return true;
      // 다른 줄은 등식인데 이 줄만 '=' 가 없음 (예: '32-9', '55' → '3x=9', '5x=5')
      if (anyEquals && !t.includes("=")) return true;
      return false;
    })
    .map(({ i }) => i);
}

// 이미지 전체를 처음부터 다시 읽기 (OCR 글자는 주지 않음). 돌려주는 값: 줄들, 쓴 모델 (실패하면 빈 배열)
export async function readWhole(png: Buffer, v = "x"): Promise<{ lines: string[]; model?: string }> {
  if (!hasVision()) return { lines: [] };
  // (이 레포 추가) Mathpix 먼저: 다시 읽은 결과에도 확신 없는 줄이 있으면 버리고 Claude 로
  const mathpix = await readWithMathpix(png, v);
  if (mathpix.length) return { lines: mathpix, model: "mathpix" };
  const prompt = `중학생이 손으로 쓴 수학 풀이 이미지다. 위에서부터 줄마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
- 학생이 틀리게 썼어도 절대 고치지 않는다 (채점은 다음 단계에서 한다). 계산이 틀렸으면 틀린 그대로 쓴다.
- ${variableHint(v)}
- 한 줄에 식 하나. 학생이 쓴 줄 수 그대로 (줄을 합치거나 나누지 않는다). 낙서·점·지운 흔적은 뺀다.
- 분수는 a/b, 거듭제곱은 ^. 공백 없이.
- 알아볼 수 없는 글자는 ?.
- JSON만 출력: {"lines": ["첫 줄", "둘째 줄", ...]}`;
  return withModels(prompt, [png], (r) => r.map((l) => String(l ?? "").replace(/\s/g, "")).filter((l) => l && l !== "?"));
}

// ── (이 레포 추가) Mathpix OCR ─────────────────────────────
const MATHPIX_ID = () => env("MATHPIX_APP_ID") ?? "";
const MATHPIX_KEY = () => env("MATHPIX_APP_KEY") ?? "";
export function hasMathpix() {
  return MATHPIX_ID().length > 0 && MATHPIX_KEY().length > 0;
}

// 키가 없거나, 실패하거나, 읽은 줄에 확신 없는 줄이 있으면 빈 배열 (→ Claude 로)
async function readWithMathpix(png: Buffer, v: string): Promise<string[]> {
  if (!hasMathpix()) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch("https://api.mathpix.com/v3/text", {
      method: "POST",
      signal: ctrl.signal,
      headers: { app_id: MATHPIX_ID(), app_key: MATHPIX_KEY(), "Content-Type": "application/json" },
      body: JSON.stringify({ src: `data:image/png;base64,${png.toString("base64")}`, formats: ["text"], rm_spaces: true, math_inline_delimiters: ["", ""] }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { text?: string; confidence?: number; error?: string };
    if (j.error) return [];
    const lines = (j.text ?? "")
      .split("\n")
      .map((l) => fromLatex(l, v))
      .filter(Boolean);
    const conf = typeof j.confidence === "number" ? j.confidence : 1;
    return lines.length && !suspectLines(lines, lines.map(() => conf), [], v).length ? lines : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Mathpix 의 LaTeX 조각을 앱의 줄 형식(공백 없음, 분수 a/b)으로
function fromLatex(line: string, v: string) {
  let s = line
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\times|\\cdot/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\[,;!: ]/g, "");
  const wrap = (t: string) => (/^[0-9a-z.]+$/i.test(t) ? t : `(${t})`);
  for (let i = 0; i < 5 && s.includes("\\frac"); i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${wrap(a)}/${wrap(b)}`);
  s = s.replace(/[{}]/g, "").replace(/\s/g, "").replace(/[−–—]/g, "-");
  return v === "x" ? s.replace(/X/g, "x") : s;
}

function variableHint(v: string) {
  return v
    ? `미지수는 ${v} 다.${v === "x" ? " 한국 학생은 x 를 'ɔc' 처럼 두 획으로 쓴다. 그런 모양은 x 로 읽는다." : ""} 곱셈 기호는 쓰지 않는다.`
    : "문자가 없는 계산 문제다.";
}

// 모델을 차례로 한 번씩 시도 (Claude 는 한 번이 길어서 되풀이하지 않는다). 응답 배열을 pick 으로 바꿔 돌려준다
async function withModels<T>(prompt: string, images: Buffer[], pick: (r: unknown[]) => T[]): Promise<{ lines: T[]; model?: string }> {
  for (const model of MODELS()) {
    const r = await callModel(model, prompt, images);
    if (r === "retry") continue;
    return { lines: pick(r ?? []), model };
  }
  return { lines: [] };
}

// 고른 줄만 다시 읽기: 그 줄만 잘라낸 이미지들만 보낸다 (OCR 글자는 주지 않음 → 엉뚱한 OCR 글자에 끌려가지 않게).
//   crops: 줄 번호 → 그 줄 이미지. 여러 줄이어도 한 번에 보낸다 (이미지 순서 = 줄 순서).
//   돌려주는 값: 줄 번호 → 다시 읽은 식, 쓴 모델 (못 읽었거나 실패하면 빈 Map)
export async function rereadLines(crops: Map<number, Buffer>, lines: string[], v = "x"): Promise<{ lines: Map<number, string>; model?: string }> {
  if (!hasVision() || !crops.size) return { lines: new Map() };
  const order = [...crops.keys()];
  const variable = variableHint(v);
  const prompt = `중학생이 손으로 쓴 수학 풀이에서 한 줄씩 잘라낸 이미지 ${order.length}장이다. 이미지마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
- 학생이 틀리게 썼어도 절대 고치지 않는다 (채점은 다음 단계에서 한다). 계산이 틀렸으면 틀린 그대로 쓴다.
- ${variable}
- 분수는 a/b, 거듭제곱은 ^. 공백 없이.
- 알아볼 수 없으면 "?".
- JSON만 출력, 이미지 순서대로 ${order.length}개: {"lines": ["첫 번째 이미지의 식", ...]}`;
  const images = order.map((i) => crops.get(i)!);
  const r = await withModels(prompt, images, (res) => res.map((l) => String(l ?? "").replace(/\s/g, "")));
  const out = new Map<number, string>();
  r.lines.forEach((line, k) => {
    const i = order[k];
    if (i === undefined || !line || line === "?") return;
    // OCR 이 비워 둔 줄은 '=' 가 있는 식일 때만 채운다 (종이에 찍힌 점을 '1' 로 읽어 줄이 생기는 것 방지)
    if (!lines[i].trim() && !line.includes("=")) return;
    out.set(i, line);
  });
  return { lines: out, model: r.model };
}

// 모델 하나 호출. 실패하면 "retry"(다음 모델), 모든 모델이 실패하면 OCR 결과 그대로
async function callModel(model: string, prompt: string, images: Buffer[]): Promise<unknown[] | null | "retry"> {
  return (await callClaudeCli(model, prompt, images)) ?? "retry";
}

// Claude Code 헤드리스로 이미지 읽기 (claudeCli.ts). 실패하면 null → OCR 결과 그대로
async function callClaudeCli(model: string, prompt: string, images: Buffer[]): Promise<unknown[] | null> {
  try {
    const text = await runClaude(`${prompt}\n다른 말 없이 JSON만 출력한다.`, { model, images });
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { lines?: unknown };
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return null;
  }
}

import { CLAUDE_MODEL, hasClaude, imageNote, runClaude } from "./claude";
import { env } from "./env";
import { LOW_OCR_CONFIDENCE, OCR_ALLOWED, falseNumberEquation } from "./types";

// 업스테이지 OCR 이 제대로 못 읽은 풀이를 다른 엔진으로 다시 읽는다.
//   흐름: 업스테이지 OCR → 확신 없는 줄 고르기(suspectLines)
//         → ① Mathpix OCR (MATHPIX_APP_ID·KEY 가 있을 때만) → 그래도 확신 없는 줄이 있으면
//         → ② Claude 헤드리스(구독)가 이미지를 보고 다시 읽기 → 채점 AI
//   Mathpix 키가 없으면 ① 은 건너뛴다. 모두 실패하면 아무것도 바꾸지 않는다 (OCR 결과 그대로).
const MATHPIX_ID = () => env("MATHPIX_APP_ID") ?? "";
const MATHPIX_KEY = () => env("MATHPIX_APP_KEY") ?? "";
const TIMEOUT_MS = 30000;

// 다시 읽는 방식: full = 확신 없는 줄이 있으면 이미지 전체를 처음부터 다시 읽어 풀이를 통째로 바꿈 (줄 나누기 오류도 고침)
//                lines = 확신 없는 줄만 잘라서 다시 읽음 (Claude 만)
export type VisionMode = "full" | "lines";
export const VISION_MODE = (): VisionMode => (env("VISION_MODE") === "lines" ? "lines" : "full");
export const VISION_MODEL = () => [hasMathpix() ? "mathpix" : "", hasClaude() ? `claude(${CLAUDE_MODEL()})` : ""].filter(Boolean).join(" → ");

// 다시 읽은 줄의 신뢰도: 불확실 기준(LOW_OCR_CONFIDENCE)보다 조금 위.
// 채점 단계가 '인식 불확실'로 보지는 않지만, 완전히 믿을 만한 값(1)도 아니다.
export const VISION_CONFIDENCE = 0.75;

export function hasMathpix() {
  return MATHPIX_ID().length > 0 && MATHPIX_KEY().length > 0;
}

export function hasVision() {
  return hasMathpix() || hasClaude();
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

// 이미지 전체를 처음부터 다시 읽기: Mathpix → (확신 없는 줄이 남으면) Claude.
// 돌려주는 값: 줄들, 쓴 엔진, 시도 기록 (모두 실패하면 빈 배열)
export async function readWhole(
  png: Buffer,
  v = "x",
): Promise<{ lines: string[]; model?: string; attempts: { engine: string; ok: boolean; reason?: string }[] }> {
  const attempts: { engine: string; ok: boolean; reason?: string }[] = [];
  if (hasMathpix()) {
    try {
      const r = await mathpixLines(png, v);
      const bad = r.lines.length ? suspectLines(r.lines, r.lines.map(() => r.confidence), [], v) : [];
      if (r.lines.length && !bad.length) {
        attempts.push({ engine: "mathpix", ok: true });
        return { lines: r.lines, model: "mathpix", attempts };
      }
      attempts.push({ engine: "mathpix", ok: false, reason: r.lines.length ? `확신 없는 줄 ${bad.length}개` : "빈 결과" });
    } catch (e) {
      attempts.push({ engine: "mathpix", ok: false, reason: (e as Error).message.slice(0, 120) });
    }
  }
  if (hasClaude()) {
    try {
      const lines = await claudeReadWhole(png, v);
      attempts.push({ engine: "claude", ok: lines.length > 0, reason: lines.length ? undefined : "빈 결과" });
      if (lines.length) return { lines, model: `claude(${CLAUDE_MODEL()})`, attempts };
    } catch (e) {
      attempts.push({ engine: "claude", ok: false, reason: (e as Error).message.slice(0, 120) });
    }
  }
  return { lines: [], attempts };
}

// ① Mathpix OCR (수식 손글씨 전용)
async function mathpixLines(png: Buffer, v: string): Promise<{ lines: string[]; confidence: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.mathpix.com/v3/text", {
      method: "POST",
      signal: ctrl.signal,
      headers: { app_id: MATHPIX_ID(), app_key: MATHPIX_KEY(), "Content-Type": "application/json" },
      body: JSON.stringify({
        src: `data:image/png;base64,${png.toString("base64")}`,
        formats: ["text"],
        rm_spaces: true,
        math_inline_delimiters: ["", ""],
      }),
    });
    if (!res.ok) throw new Error(`Mathpix ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const j = (await res.json()) as { text?: string; confidence?: number; error?: string };
    if (j.error) throw new Error(`Mathpix: ${j.error}`);
    const lines = (j.text ?? "")
      .split("\n")
      .map((l) => fromLatex(l, v))
      .filter(Boolean);
    return { lines, confidence: typeof j.confidence === "number" ? j.confidence : 1 };
  } finally {
    clearTimeout(timer);
  }
}

// Mathpix 의 LaTeX 조각을 앱의 줄 형식(공백 없음, 분수 a/b)으로
function fromLatex(line: string, v: string) {
  let s = line
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "×")
    .replace(/\\[,;!: ]/g, "");
  // \frac{a}{b} → (a)/(b), 한 글자면 괄호 없이
  for (let i = 0; i < 5 && s.includes("\\frac"); i++) {
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${wrap(a)}/${wrap(b)}`);
  }
  s = s.replace(/[{}]/g, "").replace(/\s/g, "").replace(/[−–—]/g, "-");
  if (v === "x") s = s.replace(/[×X]/g, (m) => (m === "X" ? "x" : m));
  return s;
}

const wrap = (t: string) => (/^[0-9a-z.]+$/i.test(t) ? t : `(${t})`);

function variableHint(v: string) {
  return v
    ? `미지수는 ${v} 다.${v === "x" ? " 한국 학생은 x 를 'ɔc' 처럼 두 획으로 쓴다. 그런 모양은 x 로 읽는다." : ""} 곱셈 기호는 쓰지 않는다.`
    : "문자가 없는 계산 문제다.";
}

const READ_SYSTEM = "너는 중학생 손글씨 수학 풀이를 그대로 옮겨 적는 판독기다. 고치거나 채점하지 않는다.";
const LINES_SCHEMA = {
  type: "object",
  properties: { lines: { type: "array", items: { type: "string" } } },
  required: ["lines"],
};

// ② Claude 가 이미지 전체를 다시 읽기 (OCR 글자는 주지 않음 → 엉뚱한 OCR 글자에 끌려가지 않게)
async function claudeReadWhole(png: Buffer, v: string): Promise<string[]> {
  const prompt = `중학생이 손으로 쓴 수학 풀이 이미지다. 위에서부터 줄마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
- 학생이 틀리게 썼어도 절대 고치지 않는다 (채점은 다음 단계에서 한다). 계산이 틀렸으면 틀린 그대로 쓴다.
- ${variableHint(v)}
- 한 줄에 식 하나. 학생이 쓴 줄 수 그대로 (줄을 합치거나 나누지 않는다). 낙서·점·지운 흔적은 뺀다.
- 분수는 a/b, 거듭제곱은 ^. 공백 없이.
- 알아볼 수 없는 글자는 ?.${imageNote(1)}`;
  const r = await runClaude<{ lines: string[] }>({ system: READ_SYSTEM, prompt, schema: LINES_SCHEMA, images: [png] });
  return r.lines.map((l) => String(l ?? "").replace(/\s/g, "")).filter((l) => l && l !== "?");
}

// 고른 줄만 다시 읽기 (VISION_MODE=lines): 그 줄만 잘라낸 이미지들을 Claude 에게 한 번에 보낸다 (이미지 순서 = 줄 순서).
//   돌려주는 값: 줄 번호 → 다시 읽은 식, 쓴 모델 (못 읽었거나 실패하면 빈 Map)
export async function rereadLines(crops: Map<number, Buffer>, lines: string[], v = "x"): Promise<{ lines: Map<number, string>; model?: string }> {
  if (!hasClaude() || !crops.size) return { lines: new Map() };
  const order = [...crops.keys()];
  const prompt = `중학생이 손으로 쓴 수학 풀이에서 한 줄씩 잘라낸 이미지 ${order.length}장이다. 이미지마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
- 학생이 틀리게 썼어도 절대 고치지 않는다 (채점은 다음 단계에서 한다). 계산이 틀렸으면 틀린 그대로 쓴다.
- ${variableHint(v)}
- 분수는 a/b, 거듭제곱은 ^. 공백 없이.
- 알아볼 수 없으면 "?".
- lines 에 이미지 순서대로 ${order.length}개.${imageNote(order.length)}`;
  const out = new Map<number, string>();
  try {
    const r = await runClaude<{ lines: string[] }>({
      system: READ_SYSTEM,
      prompt,
      schema: LINES_SCHEMA,
      images: order.map((i) => crops.get(i)!),
    });
    r.lines.forEach((raw, k) => {
      const line = String(raw ?? "").replace(/\s/g, "");
      const i = order[k];
      if (i === undefined || !line || line === "?") return;
      // OCR 이 비워 둔 줄은 '=' 가 있는 식일 때만 채운다 (종이에 찍힌 점을 '1' 로 읽어 줄이 생기는 것 방지)
      if (!lines[i].trim() && !line.includes("=")) return;
      out.set(i, line);
    });
  } catch {
    // 실패하면 OCR 결과 그대로
  }
  return { lines: out, model: `claude(${CLAUDE_MODEL()})` };
}

import { runClaude } from "./claudeCli";
import { parseAiJson } from "./aiJson";
import { env } from "./env";
import { LOW_OCR_CONFIDENCE, OCR_ALLOWED, falseNumberEquation, strayLetters } from "./types";

// OCR 이 제대로 못 읽은 풀이를 Claude(Claude Code 헤드리스, claude -p)가 이미지를 보고 다시 읽는다.
//   흐름: 업스테이지 OCR → 확신 없는 줄 고르기(suspectLines) → Claude 가 이미지를 보고 다시 읽기 → 채점(Claude)
//   제출 채점 경로에서는 Gemini·Solar 를 쓰지 않는다. Claude 호출이 실패하면 아무것도 바꾸지 않는다 (OCR 결과 그대로).
//   VISION_MODEL: Claude 모델 (기본 sonnet, 쉼표로 여러 개면 앞 모델이 실패할 때 다음 모델)
const MODELS = () =>
  (env("VISION_MODEL") ?? "sonnet")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
export const VISION_MODEL = () => MODELS().join(",");
// 다시 읽는 방식: lines(기본) = 확신 없는 줄만 잘라서 다시 읽음 (풀이 칸에 줄을 그어 나눠서 줄 나누기 오류가 줄어듦)
//                full = 확신 없는 줄이 있으면 이미지 전체를 처음부터 다시 읽어 풀이를 통째로 바꿈 (줄 나누기 오류도 고침)
export type VisionMode = "full" | "lines";
export const VISION_MODE = (): VisionMode => (env("VISION_MODE") === "full" ? "full" : "lines");
// LLM 이 다시 읽은 줄의 신뢰도: 불확실 기준(LOW_OCR_CONFIDENCE)보다 조금 위.
// 채점 단계가 '인식 불확실'로 보지는 않지만, 완전히 믿을 만한 값(1)도 아니다.
export const VISION_CONFIDENCE = 0.75;

// VISION=off 로만 끈다 (claude 가 없으면 호출이 실패해 OCR 결과 그대로)
export function hasVision() {
  return env("VISION") !== "off";
}

// 확신 없는 줄 번호: 비었거나, 신뢰도가 낮거나, 수식에 없는 글자(つし·次 등)나 미지수가 아닌 영문자가 섞였거나,
// 획에서 찾은 분수보다 '/' 가 적거나, 미지수 문항인데 '2=4' 처럼 성립하지 않는 숫자 등식인 줄 (x 를 숫자로 읽음)
//  question: 문제 글 (문제에 나온 글자 a_n·k·f 등은 이상한 글자로 보지 않는다. 글씨체 판정과 같은 기준)
export function suspectLines(lines: string[], confidences: number[], fractions: number[], v = "x", question = ""): number[] {
  const anyEquals = lines.some((l) => l.includes("="));
  // 계산 이어 쓰기: 첫 줄은 식, 다음 줄부터 '=…' (log₂12 - log₂3 → =log₂4 → =2). 이때 '=' 로 시작하는 줄·'=' 없는 첫 줄은 정상
  const chain = !!lines[0]?.trim() && !lines[0].includes("=") && lines.slice(1).some((l) => l.trim().startsWith("="));
  return lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => {
      const t = line.replace(/\s/g, "");
      if (!t) return true;
      if ((confidences[i] ?? 1) < LOW_OCR_CONFIDENCE) return true;
      if (!OCR_ALLOWED.test(t)) return true;
      if (strayLetters(t, v, question)) return true;
      if ((t.match(/\//g)?.length ?? 0) < (fractions[i] ?? 0)) return true;
      if (v && falseNumberEquation(t)) return true;
      // 모양이 이상한 식: '==', '=' 로 시작·끝, 연산자로 끝남
      if (/==|=$|[+\-*/=]$/.test(t) || (t.startsWith("=") && !(chain && i > 0))) return true;
      // 다른 줄은 등식인데 이 줄만 '=' 가 없음 (예: '32-9', '55' → '3x=9', '5x=5')
      if (anyEquals && !t.includes("=") && !(chain && i === 0)) return true;
      return false;
    })
    .map(({ i }) => i);
}

// 이미지 전체를 처음부터 다시 읽기 (OCR 글자는 주지 않음). 돌려주는 값: 줄들, 쓴 모델 (실패하면 빈 배열)
export async function readWhole(png: Buffer, v = "x"): Promise<{ lines: string[]; model?: string }> {
  if (!hasVision()) return { lines: [] };
  const prompt = `학생이 손으로 쓴 수학 풀이 이미지다. 위에서부터 줄마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
- 학생이 틀리게 썼어도 절대 고치지 않는다 (채점은 다음 단계에서 한다). 계산이 틀렸으면 틀린 그대로 쓴다.
- ${variableHint(v)}
- 한 줄에 식 하나. 학생이 쓴 줄 수 그대로 (줄을 합치거나 나누지 않는다). 낙서·점·지운 흔적은 뺀다.
- 분수는 a/b, 거듭제곱은 ^. 공백 없이.
- 알아볼 수 없는 글자는 ?.
- JSON만 출력: {"lines": ["첫 줄", "둘째 줄", ...]}`;
  return withModels(prompt, [png], (r) => r.map((l) => String(l ?? "").replace(/\s/g, "")).filter((l) => l && l !== "?"));
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
  const prompt = `학생이 손으로 쓴 수학 풀이에서 한 줄씩 잘라낸 이미지 ${order.length}장이다. 이미지마다 쓰인 식을 학생이 쓴 그대로 옮겨 적는다.
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

// Claude Code 기본 시스템 프롬프트(코딩 도우미용, 길다) 대신 쓰는 짧은 지시문 → 한 번에 쓰는 입력 토큰 약 절반
// (10건 비교: 읽은 결과는 기본 프롬프트와 같거나 더 나았고, 이미지 열기 → JSON 흐름도 같음)
const VISION_SYSTEM = "너는 손글씨 수학 풀이 이미지를 글자로 옮기는 도구다. Read 도구로 이미지 파일을 열어 보고, 요청한 JSON만 출력한다.";

// Claude Code 헤드리스로 이미지 읽기 (claudeCli.ts). 실패하면 null → OCR 결과 그대로
async function callClaudeCli(model: string, prompt: string, images: Buffer[]): Promise<unknown[] | null> {
  try {
    const text = await runClaude(`${prompt}\n다른 말 없이 JSON만 출력한다.`, { model, images, system: VISION_SYSTEM });
    const parsed = (parseAiJson(text) ?? {}) as { lines?: unknown };
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return null;
  }
}

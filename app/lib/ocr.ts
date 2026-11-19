import { runClaude } from "./claude";

// 손글씨 OCR 폴백 체인: Upstage → (키가 있으면) Mathpix → Claude → 실패 시 "확인 필요"

export type OcrEngine = "upstage" | "mathpix" | "claude";
export type OcrAttempt = { engine: OcrEngine; ok: boolean; reason?: string; confidence?: number | null; text?: string };
export type OcrResult = { engine: OcrEngine; text: string; confidence: number | null };

const MIN_CONFIDENCE = Number(process.env.OCR_MIN_CONFIDENCE ?? 0.6);

// 실패 이유를 돌려준다. 통과면 null.
function judge(text: string, confidence: number | null): string | null {
  if (!text.trim()) return "빈 결과";
  if (confidence !== null && confidence < MIN_CONFIDENCE) return `신뢰도 ${confidence.toFixed(2)} < ${MIN_CONFIDENCE}`;
  if (!/[0-9xX=]/.test(text)) return "수식으로 읽히지 않음";
  return null;
}

async function upstageOcr(image: Buffer): Promise<OcrResult> {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key) throw new Error("UPSTAGE_API_KEY 없음");
  const fd = new FormData();
  fd.append("document", new Blob([new Uint8Array(image)], { type: "image/png" }), "solution.png");
  fd.append("model", "ocr");
  const res = await fetch("https://api.upstage.ai/v1/document-digitization", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Upstage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text: string = j.text ?? (j.pages ?? []).map((p: { text?: string }) => p.text ?? "").join("\n");
  const confidence: number | null = typeof j.confidence === "number" ? j.confidence : (j.pages?.[0]?.confidence ?? null);
  return { engine: "upstage", text, confidence };
}

function mathpixEnabled() {
  return !!(process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY);
}

async function mathpixOcr(image: Buffer): Promise<OcrResult> {
  const res = await fetch("https://api.mathpix.com/v3/text", {
    method: "POST",
    headers: {
      app_id: process.env.MATHPIX_APP_ID!,
      app_key: process.env.MATHPIX_APP_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      src: `data:image/png;base64,${image.toString("base64")}`,
      formats: ["text"],
      rm_spaces: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Mathpix ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  if (j.error) throw new Error(`Mathpix: ${j.error}`);
  return { engine: "mathpix", text: j.text ?? "", confidence: typeof j.confidence === "number" ? j.confidence : null };
}

async function claudeOcr(dir: string): Promise<OcrResult> {
  const out = await runClaude<{ lines: string[]; legible: boolean; confidence: number }>({
    cwd: dir,
    allowRead: true,
    prompt: [
      "./solution.png 는 중학생이 태블릿에 손으로 쓴 일차방정식 풀이 이미지다.",
      "Read 도구로 이미지를 열고, 적힌 내용을 위에서 아래로 한 줄씩 그대로 옮겨라.",
      "틀린 계산이 있어도 절대 고치지 말고 학생이 쓴 그대로 적는다. 지운 흔적은 무시한다.",
      "읽을 수 없는 글자는 ? 로 쓴다. 전체를 거의 읽을 수 없으면 legible=false.",
      "confidence 는 0~1 사이로 판독 확신도.",
    ].join("\n"),
    schema: {
      type: "object",
      properties: {
        lines: { type: "array", items: { type: "string" } },
        legible: { type: "boolean" },
        confidence: { type: "number" },
      },
      required: ["lines", "legible", "confidence"],
    },
  });
  if (!out.legible) return { engine: "claude", text: "", confidence: out.confidence };
  return { engine: "claude", text: out.lines.join("\n"), confidence: out.confidence };
}

export async function runOcrChain(image: Buffer, dir: string) {
  const attempts: OcrAttempt[] = [];
  const steps: [OcrEngine, () => Promise<OcrResult>][] = [["upstage", () => upstageOcr(image)]];
  if (mathpixEnabled()) steps.push(["mathpix", () => mathpixOcr(image)]);
  steps.push(["claude", () => claudeOcr(dir)]);

  for (const [engine, fn] of steps) {
    try {
      const r = await fn();
      const fail = judge(r.text, r.confidence);
      attempts.push({ engine, ok: !fail, reason: fail ?? undefined, confidence: r.confidence, text: r.text.slice(0, 500) });
      if (!fail) return { result: r, attempts };
    } catch (e) {
      attempts.push({ engine, ok: false, reason: (e as Error).message });
    }
  }
  return { result: null, attempts };
}

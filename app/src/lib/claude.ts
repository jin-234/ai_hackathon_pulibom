import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { env } from "./env";

// Claude Code 헤드리스 모드(`claude -p`) 호출.
//   API 키가 아니라 이 컴퓨터에 로그인된 Claude 구독(결제분)으로 동작한다.
//   → 서버는 `claude` 가 로그인된 노트북에서 `npm run dev` / `npm start` 로 띄운다 (Vercel 에서는 안 됨).
//   이미지가 있으면 임시 폴더에 image1.png, image2.png … 로 저장하고 Read 도구로 직접 보게 한다.
//   --json-schema 로 응답 형식을 강제하므로 JSON 파싱 실패가 없다.

export const CLAUDE_MODEL = () => env("CLAUDE_MODEL") ?? "sonnet";
const CLAUDE_BIN = () => env("CLAUDE_BIN") ?? "claude";
const TIMEOUT_MS = 180_000;

export function hasClaude() {
  return env("CLAUDE_DISABLED") !== "1";
}

export async function runClaude<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
  images?: Buffer[];
  timeoutMs?: number;
}): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pulibom-claude-"));
  try {
    const images = opts.images ?? [];
    await Promise.all(images.map((png, i) => writeFile(path.join(dir, `image${i + 1}.png`), png)));
    const args = [
      "-p",
      opts.prompt,
      "--system-prompt",
      opts.system,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(opts.schema),
      "--model",
      CLAUDE_MODEL(),
      "--no-session-persistence",
      "--strict-mcp-config",
      "--setting-sources",
      "",
    ];
    if (images.length) args.push("--tools", "Read", "--allowedTools", "Read");
    else args.push("--tools", "");
    return await spawnClaude<T>(args, dir, opts.timeoutMs ?? TIMEOUT_MS);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function spawnClaude<T>(args: string[], cwd: string, timeoutMs: number): Promise<T> {
  // ANTHROPIC_API_KEY 가 있으면 구독 대신 API 과금으로 넘어가므로 지운다
  const childEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY;
  return new Promise<T>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN(), args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude 시간 초과 (${timeoutMs / 1000}초)`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`claude 실행 실패: ${e.message} (.env 의 CLAUDE_BIN 확인)`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out) as { is_error?: boolean; result?: string; subtype?: string; structured_output?: T };
        if (res.is_error || res.structured_output == null) {
          return reject(new Error(`Claude 오류: ${String(res.result ?? res.subtype).slice(0, 300)}`));
        }
        resolve(res.structured_output);
      } catch {
        reject(new Error(`Claude 응답 파싱 실패 (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
    });
  });
}

// 이미지 파일 이름 안내 (프롬프트에 붙인다)
export function imageNote(count: number) {
  if (!count) return "";
  const files = Array.from({ length: count }, (_, i) => `./image${i + 1}.png`).join(", ");
  return `\n\n이미지 파일: ${files} — 반드시 Read 도구로 직접 열어 본다.`;
}

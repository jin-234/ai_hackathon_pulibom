import { spawn } from "node:child_process";

// Claude Code 헤드리스 모드(`claude -p`)로 호출한다.
// API 키가 아니라 이 컴퓨터에 로그인된 Claude 구독으로 동작하므로,
// 서버는 `claude` 가 로그인된 컴퓨터에서 `npm run dev` / `npm start` 로 띄워야 한다.

type RunOptions = {
  prompt: string;
  schema: object;
  cwd: string; // 이미지 파일이 있는 임시 폴더
  allowRead?: boolean; // 이미지를 읽어야 하면 true
  timeoutMs?: number;
};

export async function runClaude<T>({ prompt, schema, cwd, allowRead = false, timeoutMs = 180_000 }: RunOptions): Promise<T> {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
    "--no-session-persistence",
    "--strict-mcp-config",
    "--setting-sources",
    "",
  ];
  if (allowRead) args.push("--tools", "Read", "--allowedTools", "Read");
  else args.push("--tools", "");
  if (process.env.CLAUDE_MODEL) args.push("--model", process.env.CLAUDE_MODEL);

  // ANTHROPIC_API_KEY 가 있으면 구독 대신 API 과금으로 넘어가므로 제거
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  return new Promise<T>((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN || "claude", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude 시간 초과 (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`claude 실행 실패: ${e.message} (CLAUDE_BIN 경로 확인)`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out);
        if (res.is_error || res.structured_output == null) {
          return reject(new Error(`Claude 오류: ${String(res.result ?? res.subtype).slice(0, 300)}`));
        }
        resolve(res.structured_output as T);
      } catch {
        reject(new Error(`Claude 응답 파싱 실패 (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
    });
  });
}

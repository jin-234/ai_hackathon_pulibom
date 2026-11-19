import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { env } from "./env";

// Claude Code 헤드리스(claude -p)로 한 번 묻고 답 글자를 돌려준다. (실험용: 이 맥에 로그인된 구독 사용량, API 결제 없음)
//   - ANTHROPIC_API_KEY 는 지우고 실행 (있으면 구독 대신 API 로 과금되므로)
//   - 이미지가 있으면 임시 폴더에 파일로 두고 Read 도구만 허용, 없으면 도구 없이
//   - MCP·세션 저장 끔, system 을 주면 Claude Code 기본 시스템 프롬프트 대신 그것만 씀
//   로그인 안 됨·한도·시간 초과는 오류를 던진다
const TIMEOUT_MS = 180000;

// 이 컴퓨터에서 claude 명령을 쓸 수 있는지 (한 번만 확인해 기억)
let available: Promise<boolean> | null = null;
export function claudeAvailable(): Promise<boolean> {
  available ??= new Promise((resolve) => {
    execFile(env("CLAUDE_CLI") ?? "claude", ["--version"], { timeout: 10000 }, (err) => resolve(!err));
  });
  return available;
}

export async function runClaude(prompt: string, opts: { model: string; system?: string; images?: Buffer[] }): Promise<string> {
  // 실행 폴더는 하나로 고정 (Claude Code 가 실행 폴더마다 ~/.claude/projects 에 폴더를 만들기 때문). 파일 이름만 매번 다르게
  const dir = path.join(tmpdir(), "pulibom-claude-cli");
  await mkdir(dir, { recursive: true });
  const tag = randomUUID().slice(0, 8);
  try {
    const images = opts.images ?? [];
    const names = images.map((_, i) => `${tag}-image${i + 1}.png`);
    await Promise.all(images.map((png, i) => writeFile(path.join(dir, names[i]), png)));
    const full = images.length ? `${prompt}\n\n이미지 파일 (Read 도구로 열어 본다, 순서대로): ${names.join(", ")}` : prompt;
    const args = [
      "-p", full,
      "--model", opts.model,
      "--output-format", "json",
      "--tools", images.length ? "Read" : "",
      ...(images.length ? ["--allowedTools", "Read"] : []),
      "--no-session-persistence",
      "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      ...(opts.system ? ["--system-prompt", opts.system] : []),
    ];
    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(env("CLAUDE_CLI") ?? "claude", args, { cwd: dir, env: childEnv, timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, out) =>
        err ? reject(err) : resolve(out),
      );
      child.stdin?.end(); // 표준 입력을 기다리지 않게
    });
    const out = JSON.parse(stdout) as { result?: string; is_error?: boolean };
    if (out.is_error || !out.result) throw new Error(`Claude 응답 오류: ${String(out.result ?? "").slice(0, 200)}`);
    return out.result;
  } finally {
    await Promise.all((opts.images ?? []).map((_, i) => rm(path.join(dir, `${tag}-image${i + 1}.png`), { force: true })));
  }
}

import { readFileSync } from "fs";
import path from "path";

// API 키는 저장소 루트의 .env 하나로 관리한다 (ai-test 와 공유).
// Next.js 는 app/ 폴더의 .env 만 읽기 때문에, 루트 .env 를 직접 읽어 보충한다.
let rootEnv: Record<string, string> | null = null;

function loadRootEnv() {
  if (rootEnv) return rootEnv;
  rootEnv = {};
  try {
    const text = readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) rootEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // 루트 .env 없음
  }
  return rootEnv;
}

export function env(name: string): string | undefined {
  const v = process.env[name] || loadRootEnv()[name];
  return v ? v : undefined;
}

// AI 응답에서 JSON 꺼내기 (채점·요약·보충·OCR 보정·다시 읽기 공용)
//  AI 가 근거에 LaTeX(\frac{1}{2}, \sqrt{4}, \times, \neq)를 쓰면 JSON 이 깨진다:
//   - \sqrt·\left·\alpha 처럼 JSON 에 없는 이스케이프 → JSON.parse 실패 → 분석이 '오류'가 됨
//   - \frac·\times·\neq·\beta 는 JSON 이스케이프(\f \t \n \b)로 읽혀 글자가 조용히 깨짐
//  그래서 글자 두 개 이상이 붙은 \명령 과 JSON 에 없는 이스케이프는 역슬래시를 살려서 읽고, 읽은 뒤 LaTeX 를 보기 쉬운 글자로 바꾼다.

// '\' 뒤가 A · \" · \\ · \/ 면 그대로, \명령(글자 2개 이상)이면 LaTeX, 그 밖에 JSON 에 없는 한 글자면 역슬래시를 살린다
function escapeLatex(json: string) {
  return json.replace(/\\(u[0-9a-fA-F]{4}|["\\/])|\\([a-zA-Z]{2,})|\\([\s\S])/g, (all, keep, word, ch) => {
    if (keep) return all;
    if (word) return `\\\\${word}`;
    return "bfnrt".includes(ch) ? all : `\\\\${ch}`;
  });
}

// 화면·다음 AI 입력에서 읽기 쉽게: \frac{a}{b} → (a)/(b), \sqrt{x} → √(x), \times → × …
const LATEX: [RegExp, string][] = [
  [/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)"],
  [/\\sqrt\s*\{([^{}]*)\}/g, "√($1)"],
  [/\\(?:times|cdot)/g, "×"],
  [/\\div/g, "÷"],
  [/\\(?:neq|ne)\b/g, "≠"],
  [/\\(?:leq|le)\b/g, "≤"],
  [/\\(?:geq|ge)\b/g, "≥"],
  [/\\pm/g, "±"],
  [/\\pi/g, "π"],
  [/\\theta/g, "θ"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\infty/g, "∞"],
  [/\\(?:left|right|displaystyle|,|;|!|quad)/g, ""],
  [/\\\(|\\\)|\\\[|\\\]|\$/g, ""],
  [/\\(?:log|ln|sin|cos|tan|lim)/g, (m: string) => m.slice(1)] as unknown as [RegExp, string],
];
export function plainLatex(text: string): string {
  if (!text.includes("\\") && !text.includes("$")) return text;
  let out = text;
  for (const [re, to] of LATEX) out = out.replace(re, to as string);
  // 남은 \명령{…} 은 괄호 안 글자만
  return out.replace(/\\[a-zA-Z]+\s*\{([^{}]*)\}/g, "$1").replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "");
}

function deepPlain<T>(v: T): T {
  if (typeof v === "string") return plainLatex(v) as T;
  if (Array.isArray(v)) return v.map(deepPlain) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepPlain(x)])) as T;
  return v;
}

// 응답 글에서 { … } 를 꺼내 읽는다. 못 읽으면 null
export function parseAiJson<T = Record<string, unknown>>(text: string): T | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  for (const candidate of [escapeLatex(json), json]) {
    try {
      return deepPlain(JSON.parse(candidate) as T);
    } catch {
      // 다음 방법
    }
  }
  return null;
}

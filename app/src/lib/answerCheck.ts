// 답안 칸에 쓴 답을 문항 정답과 비교한다 (제출할 때 서버에서 바로 채점)
// - 공백·대소문자·×·−·： 모양 차이는 무시
// - "x = 3" ↔ "3" 처럼 등호 오른쪽만 같아도 정답
// - "3/4" ↔ "0.75" 처럼 값이 같으면 정답
// - "96" ↔ "96 cm²" 처럼 단위만 빠져도 정답
// 답안 칸이 비었거나 문항에 정답이 없으면 비교할 수 없어 null

const UNIT = /(?:cm|mm|km|kg|ml|m|g|l|개|원|명|초|분|시간|도|°|점|살|권|장|번|%)(?:\^?[23²³])?$/;

function normalize(s: string) {
  return s
    .normalize("NFKC") // 전각 글자(：＝ 등)를 보통 글자로
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[×✕·]/g, "*")
    .replace(/[−–—]/g, "-")
    .replace(/÷/g, "/");
}

// 등호 오른쪽 (x=3 → 3)
const rhs = (s: string) => (s.includes("=") ? s.slice(s.lastIndexOf("=") + 1) : s);
const stripUnit = (s: string) => s.replace(UNIT, "");

// 숫자로 읽을 수 있으면 값 (3, -2, 0.75, 3/4, -3/4)
function valueOf(s: string): number | null {
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const v = m[2] === undefined ? Number(m[1]) : Number(m[1]) / Number(m[2]);
  return Number.isFinite(v) ? v : null;
}

function forms(s: string) {
  const n = normalize(s);
  return [...new Set([n, rhs(n), stripUnit(n), stripUnit(rhs(n))])].filter(Boolean);
}

export function checkAnswer(answerText: string | null | undefined, expected: string | null | undefined): boolean | null {
  if (!answerText?.trim() || !expected?.trim()) return null;
  const a = forms(answerText);
  const b = forms(expected);
  for (const x of a)
    for (const y of b) {
      if (x === y) return true;
      const vx = valueOf(x);
      const vy = valueOf(y);
      if (vx !== null && vy !== null && Math.abs(vx - vy) < 1e-9) return true;
    }
  return false;
}

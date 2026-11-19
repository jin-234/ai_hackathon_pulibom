// 학생이 입력한 최종 답("x=4", "-3/2", "0.5")을 숫자로 바꿔 정답과 비교
export function parseAnswer(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/^[a-zA-Z]=/, "");
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function isCorrectAnswer(given: string | null | undefined, expected: string) {
  const a = parseAnswer(given);
  const b = parseAnswer(expected);
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-9;
}

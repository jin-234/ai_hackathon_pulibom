// 일차방정식 파서·풀이기 (교사 출제 문항의 정답·해설을 자동으로 만들고 검증한다)
// 지원: 정수, x, + - * ( ), 암묵적 곱셈 (예: 3(x-2), -2x), 등호 1개

type Lin = { a: number; b: number }; // a*x + b

export type Solved = {
  question: string; // 정리된 식
  answer: string; // "x=4" 또는 "x=3/2"
  answerValue: number;
  steps: string[];
  concept: string;
};

function tokenize(src: string) {
  const s = src.replace(/[×✕χX]/g, "x").replace(/[−–—]/g, "-").replace(/÷/g, "/").replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (/\d/.test(ch)) {
      let j = i;
      while (j < s.length && /\d/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
    } else if ("x+-*()=".includes(ch)) {
      out.push(ch);
      i++;
    } else {
      throw new Error(`'${ch}' 는 쓸 수 없어요. 숫자, x, + - ( ) = 만 써 주세요.`);
    }
  }
  return out;
}

function parseSide(tokens: string[]): Lin {
  let i = 0;
  const peek = () => tokens[i];
  const mul = (p: Lin, q: Lin): Lin => {
    if (p.a !== 0 && q.a !== 0) throw new Error("x 끼리 곱하면 일차방정식이 아니에요.");
    return { a: p.a * q.b + q.a * p.b, b: p.b * q.b };
  };
  const factor = (): Lin => {
    const t = peek();
    if (t === "-") {
      i++;
      const f = factor();
      return { a: -f.a, b: -f.b };
    }
    if (t === "+") {
      i++;
      return factor();
    }
    if (t === "x") {
      i++;
      return { a: 1, b: 0 };
    }
    if (t === "(") {
      i++;
      const e = expr();
      if (peek() !== ")") throw new Error("괄호가 닫히지 않았어요.");
      i++;
      return e;
    }
    if (t !== undefined && /^\d+$/.test(t)) {
      i++;
      return { a: 0, b: Number(t) };
    }
    throw new Error("식이 올바르지 않아요.");
  };
  const term = (): Lin => {
    let v = factor();
    while (peek() === "*" || peek() === "x" || peek() === "(" || (peek() !== undefined && /^\d+$/.test(peek()!))) {
      if (peek() === "*") i++;
      v = mul(v, factor());
    }
    return v;
  };
  const expr = (): Lin => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[i++];
      const t = term();
      v = op === "+" ? { a: v.a + t.a, b: v.b + t.b } : { a: v.a - t.a, b: v.b - t.b };
    }
    return v;
  };
  const v = expr();
  if (i !== tokens.length) throw new Error("식이 올바르지 않아요.");
  return v;
}

const gcd = (p: number, q: number): number => (q === 0 ? Math.abs(p) : gcd(q, p % q));

function frac(n: number, d: number) {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
}

// 표시용 포맷
const coefX = (a: number) => (a === 1 ? "x" : a === -1 ? "-x" : `${a}x`);
function fmtLin({ a, b }: Lin) {
  if (a === 0) return `${b}`;
  if (b === 0) return coefX(a);
  return `${coefX(a)} ${b > 0 ? "+" : "-"} ${Math.abs(b)}`;
}
function prettify(src: string) {
  return src
    .replace(/\s+/g, "")
    .replace(/([^(=])([+\-=])/g, "$1 $2 ")
    .replace(/=/g, "=")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .trim();
}

// 등식을 'Ax = B' 꼴로 정리한 계수 (풀이 검산용: 어느 쪽 항에서 값이 바뀌었는지 보려고)
export function linearForm(src: string): { a: number; b: number } {
  const tokens = tokenize(src);
  const eq = tokens.indexOf("=");
  if (eq < 0 || tokens.lastIndexOf("=") !== eq) throw new Error("등호가 한 개가 아님");
  const L = parseSide(tokens.slice(0, eq));
  const R = parseSide(tokens.slice(eq + 1));
  return { a: L.a - R.a, b: R.b - L.b };
}

export function solveLinear(src: string): Solved {
  const tokens = tokenize(src);
  const eq = tokens.indexOf("=");
  if (eq < 0 || tokens.lastIndexOf("=") !== eq) throw new Error("등호(=)를 한 개 넣어 주세요.");
  const L = parseSide(tokens.slice(0, eq));
  const R = parseSide(tokens.slice(eq + 1));
  const A = L.a - R.a;
  const B = R.b - L.b;
  if (A === 0) throw new Error(B === 0 ? "해가 무수히 많아요. 다른 식을 넣어 주세요." : "해가 없어요. 다른 식을 넣어 주세요.");

  const question = prettify(src);
  const steps: string[] = [question];
  const hasParen = tokens.includes("(");
  const expanded = `${fmtLin(L)} = ${fmtLin(R)}`;
  if (hasParen && expanded.replace(/\s/g, "") !== question.replace(/\s/g, "")) steps.push(expanded);

  // 이항: x 항은 왼쪽, 상수항은 오른쪽
  const left = [L.a !== 0 ? coefX(L.a) : "", R.a !== 0 ? `${R.a > 0 ? "-" : "+"} ${coefX(Math.abs(R.a))}` : ""].filter(Boolean).join(" ");
  const right = [R.b !== 0 || L.b === 0 ? `${R.b}` : "", L.b !== 0 ? `${L.b > 0 ? "-" : "+"} ${Math.abs(L.b)}` : ""].filter(Boolean).join(" ");
  const moved = `${left.replace(/^\+ /, "")} = ${right.replace(/^\+ /, "") || "0"}`;
  if (moved.replace(/\s/g, "") !== steps[steps.length - 1].replace(/\s/g, "")) steps.push(moved);
  const combined = `${coefX(A)} = ${B}`;
  if (combined.replace(/\s/g, "") !== steps[steps.length - 1].replace(/\s/g, "")) steps.push(combined);
  const ans = frac(B, A);
  if (A !== 1) steps.push(`x = ${ans}`);

  const both = L.a !== 0 && R.a !== 0;
  const neg = A < 0 || L.a < 0 || R.a < 0;
  const concept = hasParen ? "분배법칙·동류항 정리" : both ? "동류항 정리·이항" : neg ? "정수 계산·계수 나누기" : "등식의 성질·이항";

  return { question, answer: `x=${ans}`, answerValue: B / A, steps, concept };
}

// 같은 형태로 숫자만 바꾼 문항 만들기 (답은 항상 0이 아닌 정수 → 풀이기로 다시 검증)
export function makeVariants(src: string, count = 3): string[] {
  const base = solveLinear(src);
  const tokens = tokenize(src);
  const hasParen = tokens.includes("(");
  const eq = tokens.indexOf("=");
  const L = parseSide(tokens.slice(0, eq));
  const R = parseSide(tokens.slice(eq + 1));
  const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const sign = (n: number) => (n < 0 ? -1 : 1);
  const term = (n: number, first = false) => (first ? `${n}` : n < 0 ? ` - ${-n}` : ` + ${n}`);
  const xterm = (a: number) => coefX(a);

  const out = new Set<string>();
  for (let tries = 0; out.size < count && tries < 200; tries++) {
    const x0 = rnd(-4, 9) || 2;
    let q = "";
    if (hasParen) {
      // k(x + m) = c x + d
      const k = rnd(2, 5);
      const m = rnd(-6, 6) || -2;
      const c = rnd(1, k - 1);
      const d = k * (x0 + m) - c * x0;
      q = `${k}(x${term(m)}) = ${c === 1 ? "x" : `${c}x`}${term(d)}`;
    } else if (L.a !== 0 && R.a !== 0) {
      // a x + b = c x + d
      const a = rnd(2, 7);
      const c = rnd(1, a - 1);
      const b = rnd(-9, 9) || 5;
      const d = (a - c) * x0 + b;
      q = `${xterm(a)}${term(b)} = ${xterm(c)}${term(d)}`;
    } else {
      // a x + b = c (a 의 부호는 원래 문항을 따른다)
      const a = sign(L.a || -R.a) * rnd(2, 7);
      const b = rnd(-12, 12) || 4;
      const c = a * x0 + b;
      q = `${xterm(a)}${term(b)} = ${c}`;
    }
    try {
      const s = solveLinear(q);
      if (Number.isInteger(s.answerValue) && s.answerValue !== 0 && s.question !== base.question) out.add(s.question);
    } catch {
      // 검증 실패한 문항은 버린다
    }
  }
  return [...out];
}

import { query } from "./db";
import { solveLinear } from "./equation";
import type { Adapt } from "./learningProfile";
import { ERROR_LABEL, type ErrorType } from "./types";

// 문제은행: 이름표(개념·연습시키는 오류·난이도)가 붙은 문제 틀 (DB: problem_templates)
// 학생·그룹의 약점(반복 오류·취약 개념)에 맞는 틀을 골라, 숫자를 바꿔 문항을 만든다.
// 만든 문항은 풀이기(solveLinear)로 다시 검증하고, 답은 0이 아닌 정수만 쓴다.
export type Template = {
  id: string;
  shape: string;
  pattern: string;
  grade: number;
  unit: string;
  concept: string;
  targets: ErrorType[];
  level: 1 | 2 | 3;
  sample: string;
  conceptId?: string; // 개념 지도(concepts)의 개념
};

export type BankItem = { question: string; answer: string; concept: string; why: string; templateId: string; level: number };

// 개념 이름을 낱말로 ('등식의 성질·이항' → ['등식의', '성질', '이항'])
export const conceptWords = (c: string) => c.split(/[·\s,]+/).filter((w) => w.length >= 2);

export const LEVEL_LABEL = { 1: "쉬움", 2: "보통", 3: "어려움" } as const;

// ── 틀 모양별 생성기: 숫자만 바꿔 식을 만든다 (해 x0 를 먼저 정하고 거꾸로 만든다) ──
const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const x = (a: number) => (a === 1 ? "x" : a === -1 ? "-x" : `${a}x`);
const plus = (n: number) => (n < 0 ? ` - ${-n}` : n === 0 ? "" : ` + ${n}`);
const nz = (lo: number, hi: number) => pick([...Array(hi - lo + 1)].map((_, i) => lo + i).filter((n) => n !== 0));

const SHAPES: Record<string, () => string> = {
  // ax + b = c (전부 양수)
  "ax+b=c": () => {
    const x0 = rnd(1, 9), a = rnd(2, 7), b = rnd(1, 12);
    return `${x(a)} + ${b} = ${a * x0 + b}`;
  },
  // ax - b = c
  "ax-b=c": () => {
    const x0 = rnd(1, 9), a = rnd(2, 7), b = rnd(1, 12);
    return `${x(a)} - ${b} = ${a * x0 - b}`;
  },
  // ax = c (a 또는 x0 가 음수)
  "ax=c": () => {
    const a = nz(-7, 7) || -3, x0 = nz(-9, 9);
    const fixed = a === 1 || a === -1 ? -3 : a;
    return `${x(fixed)} = ${fixed * x0}`;
  },
  // b - ax = c
  "b-ax=c": () => {
    const x0 = nz(-6, 9), a = rnd(2, 6), b = rnd(1, 15);
    return `${b} - ${x(a)} = ${b - a * x0}`;
  },
  // ax + b = c, 해가 음수
  "ax+b=c,neg": () => {
    const x0 = -rnd(1, 9), a = rnd(2, 7), b = rnd(1, 15);
    return `${x(a)} + ${b} = ${a * x0 + b}`;
  },
  // ax + bx + c = d (같은 쪽 동류항)
  "ax+bx+c=d": () => {
    const x0 = nz(-5, 9), a = rnd(2, 6), b = nz(-4, 5), c = nz(-9, 9);
    if (a + b === 0) return "";
    return `${x(a)}${b < 0 ? ` - ${x(-b)}` : ` + ${x(b)}`}${plus(c)} = ${(a + b) * x0 + c}`;
  },
  // ax + b = cx + d, a > c
  "ax+b=cx+d": () => {
    const x0 = nz(-5, 9), a = rnd(3, 8), c = rnd(1, a - 1), b = nz(-9, 9);
    return `${x(a)}${plus(b)} = ${x(c)}${plus((a - c) * x0 + b)}`;
  },
  // ax + b = cx + d, a < c (옮기면 x 계수가 음수)
  "ax+b=cx+d,neg": () => {
    const x0 = nz(-5, 9), a = rnd(1, 5), c = rnd(a + 1, 8), b = nz(-9, 12);
    return `${x(a)}${plus(b)} = ${x(c)}${plus((a - c) * x0 + b)}`;
  },
  // k(x + m) = c
  "k(x+m)=c": () => {
    const x0 = nz(-5, 9), k = rnd(2, 6), m = nz(-7, 7);
    return `${k}(x${plus(m)}) = ${k * (x0 + m)}`;
  },
  // k(x + m) = cx + d
  "k(x+m)=cx+d": () => {
    const x0 = nz(-5, 9), k = rnd(2, 5), m = nz(-6, 6), c = rnd(1, k - 1);
    return `${k}(x${plus(m)}) = ${x(c)}${plus(k * (x0 + m) - c * x0)}`;
  },
  // -(x + m) = c
  "-(x+m)=c": () => {
    const x0 = nz(-6, 9), m = nz(-8, 8);
    return `-(x${plus(m)}) = ${-(x0 + m)}`;
  },
};

// ── 계산 틀: 식이 아니라 계산·값 구하기라서 문제와 답을 같이 만든다 ──
type Frac = { n: number; d: number };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n: number, d: number): Frac => {
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
};
const fstr = (f: Frac) => (f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`);
const paren = (s: string) => (s.startsWith("-") ? `(${s})` : s);
// 기약분수 하나 (분모 2~9, 정수가 아닌 것)
const properFrac = (): Frac => {
  for (;;) {
    const d = rnd(2, 9), n = rnd(1, d * 2 - 1);
    const f = frac(n, d);
    if (f.d !== 1) return f;
  }
};
// 일차식 ax + b 를 보기 좋게 (계수 0·1·-1 처리)
const linear = (a: number, b: number) => {
  const head = a === 0 ? "" : x(a);
  if (!head) return `${b}`;
  return b === 0 ? head : `${head}${plus(b)}`;
};

// 정수 n 을 10^k 로 나눈 소수 문자열 (부동소수 오차 없이: dec(36, 2) → "0.36", dec(150, 2) → "1.5")
const dec = (n: number, k: number) => {
  const neg = n < 0;
  const s = String(Math.abs(n)).padStart(k + 1, "0");
  const out = k ? `${s.slice(0, -k)}.${s.slice(-k)}`.replace(/\.?0+$/, "") : s;
  return neg ? `-${out}` : out;
};

export const CALC: Record<string, () => { question: string; answer: string } | null> = {
  "frac-addsub": () => {
    const p = properFrac(), q = properFrac(), sub = Math.random() < 0.5;
    if (p.d === q.d) return null; // 통분이 필요한 것만
    const r = frac(p.n * q.d + (sub ? -1 : 1) * q.n * p.d, p.d * q.d);
    if (r.n === 0) return null;
    return { question: `계산하세요: ${fstr(p)} ${sub ? "-" : "+"} ${fstr(q)}`, answer: fstr(r) };
  },
  "frac-muldiv": () => {
    const p = properFrac(), q = properFrac(), div = Math.random() < 0.5;
    if (p.n === q.n && p.d === q.d) return null;
    const r = div ? frac(p.n * q.d, p.d * q.n) : frac(p.n * q.n, p.d * q.d);
    return { question: `계산하세요: ${fstr(p)} ${div ? "÷" : "×"} ${fstr(q)}`, answer: fstr(r) };
  },
  box: () => {
    const v = rnd(2, 9), a = rnd(2, 6), b = rnd(1, 15);
    return Math.random() < 0.5
      ? { question: `□ 를 구하세요: ${a} × □ + ${b} = ${a * v + b}`, answer: `□=${v}` }
      : { question: `□ 를 구하세요: ${a} × □ - ${b} = ${a * v - b}`, answer: `□=${v}` };
  },
  "int-addsub": () => {
    const a = -rnd(2, 12), b = nz(-9, 9), c = nz(-9, 9);
    return { question: `계산하세요: (${a}) + ${paren(`${b}`)} - ${paren(`${c}`)}`, answer: `${a + b - c}` };
  },
  "int-muldiv": () => {
    const b = nz(-6, 6), q = nz(-6, 6), c = nz(-5, 5);
    if (Math.abs(b) === 1 || Math.abs(q) === 1) return null;
    const a = b * q; // a ÷ b 가 나누어떨어지게
    if (a > 0 && b > 0 && c > 0) return null; // 음수가 하나는 있게
    return { question: `계산하세요: ${paren(`${a}`)} ÷ ${paren(`${b}`)} × ${paren(`${c}`)}`, answer: `${q * c}` };
  },
  "rat-addsub": () => {
    const p = properFrac(), q = properFrac();
    if (p.d === q.d) return null;
    const P = frac(-p.n, p.d), sub = Math.random() < 0.5;
    const r = frac(P.n * q.d + (sub ? -1 : 1) * q.n * P.d, P.d * q.d);
    if (r.n === 0) return null;
    return { question: `계산하세요: (${fstr(P)}) ${sub ? "-" : "+"} ${fstr(q)}`, answer: fstr(r) };
  },
  "expr-value": () => {
    const v = nz(-5, 5), a = nz(-6, 6), b = nz(-9, 9);
    if (Math.abs(a) === 1 || v > 0) return null; // 음수를 대입할 때 부호 실수를 보려고 음수만
    return { question: `x = ${v} 일 때, ${linear(a, b)} 의 값은?`, answer: `${a * v + b}` };
  },
  distribute: () => {
    const k = nz(-5, 5), a = rnd(2, 6), b = nz(-9, 9);
    if (Math.abs(k) === 1) return null;
    return { question: `간단히 하세요: ${k}(${linear(a, b)})`, answer: linear(k * a, k * b).replace(/\s/g, "") };
  },
  "like-terms": () => {
    const a = rnd(2, 8), b = nz(-9, 9), c = nz(-7, 7), d = nz(-9, 9);
    if (a + c === 0 || b + d === 0) return null;
    return { question: `간단히 하세요: ${linear(a, b)}${c < 0 ? ` - ${x(-c)}` : ` + ${x(c)}`}${plus(d)}`, answer: linear(a + c, b + d).replace(/\s/g, "") };
  },
  // ── 초등 과정 (예전 입학 레벨 테스트용, 지금은 쓰지 않음) ──
  mixed: () => {
    // a ± b × (c - d) ÷ e, 나누어떨어지고 결과는 자연수
    const e = rnd(2, 5), m = rnd(2, 6), d = rnd(1, 6), c = d + rnd(1, 6), b = e * m;
    const mid = m * (c - d);
    const sub = Math.random() < 0.5;
    const a = sub ? mid + rnd(1, 30) : rnd(2, 30);
    return { question: `계산하세요: ${a} ${sub ? "-" : "+"} ${b} × (${c} - ${d}) ÷ ${e}`, answer: `${sub ? a - mid : a + mid}` };
  },
  factor: () => {
    const g = rnd(2, 9), p = rnd(2, 7), q = rnd(2, 7);
    if (p === q || gcd(p, q) !== 1) return null;
    const [u, v] = [g * Math.min(p, q), g * Math.max(p, q)];
    return Math.random() < 0.5
      ? { question: `두 수 ${u}, ${v} 의 최대공약수를 구하세요.`, answer: `${g}` }
      : { question: `두 수 ${u}, ${v} 의 최소공배수를 구하세요.`, answer: `${g * p * q}` };
  },
  decimal: () => {
    if (Math.random() < 0.5) {
      const A = rnd(11, 49), B = rnd(11, 29); // A/10 × B/10
      if (A % 10 === 0 || B % 10 === 0) return null;
      return { question: `계산하세요: ${dec(A, 1)} × ${dec(B, 1)}`, answer: dec(A * B, 2) };
    }
    const q = rnd(2, 12), B = rnd(2, 9); // (q × B/10) ÷ B/10 = q
    return { question: `계산하세요: ${dec(q * B, 1)} ÷ ${dec(B, 1)}`, answer: `${q}` };
  },
  pattern: () => {
    const a = rnd(2, 6), b = rnd(1, 9), v = rnd(3, 12), less = Math.random() < 0.4;
    if (less && a * v - b <= 0) return null;
    return {
      question: `y 는 x 의 ${a}배보다 ${b} ${less ? "작은" : "큰"} 수입니다. x = ${v} 일 때 y 의 값은?`,
      answer: `${less ? a * v - b : a * v + b}`,
    };
  },
  ratio: () => {
    if (Math.random() < 0.5) {
      const n = 20 * rnd(1, 10), p = 5 * rnd(1, 19);
      return { question: `${n} 의 ${p}% 는 얼마입니까?`, answer: `${(n * p) / 100}` };
    }
    const b = pick([2, 4, 5, 10, 20, 25, 50]), a = rnd(1, b - 1);
    if (gcd(a, b) !== 1 && b <= 5) return null;
    return { question: `비 ${a} : ${b} 의 비율을 백분율로 나타내세요.`, answer: `${(a * 100) / b}%` };
  },
  proportion: () => {
    const a = rnd(1, 9), b = rnd(2, 9), k = rnd(2, 6);
    if (a === b || gcd(a, b) !== 1) return null;
    return Math.random() < 0.5
      ? { question: `□ 를 구하세요: ${a} : ${b} = □ : ${b * k}`, answer: `□=${a * k}` }
      : { question: `□ 를 구하세요: ${a} : ${b} = ${a * k} : □`, answer: `□=${b * k}` };
  },
  area: () => {
    const kind = pick(["삼각형", "평행사변형", "사다리꼴"] as const);
    if (kind === "사다리꼴") {
      const t = rnd(2, 9), u = t + rnd(1, 8), h = rnd(2, 9);
      if (((t + u) * h) % 2) return null;
      return { question: `윗변이 ${t} cm, 아랫변이 ${u} cm, 높이가 ${h} cm 인 사다리꼴의 넓이는 몇 cm² 입니까?`, answer: `${((t + u) * h) / 2}` };
    }
    const w = rnd(3, 14), h = rnd(2, 12);
    if (kind === "삼각형" && (w * h) % 2) return null;
    return { question: `밑변이 ${w} cm, 높이가 ${h} cm 인 ${kind}의 넓이는 몇 cm² 입니까?`, answer: `${kind === "삼각형" ? (w * h) / 2 : w * h}` };
  },
  circle: () => {
    const r = rnd(2, 10);
    return Math.random() < 0.5
      ? { question: `반지름이 ${r} cm 인 원의 넓이는 몇 cm² 입니까? (원주율 3.14)`, answer: dec(r * r * 314, 2) }
      : { question: `지름이 ${2 * r} cm 인 원의 둘레는 몇 cm 입니까? (원주율 3.14)`, answer: dec(2 * r * 314, 2) };
  },
  volume: () => {
    const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
    if (a === b && b === c) return { question: `한 모서리가 ${a} cm 인 정육면체의 부피는 몇 cm³ 입니까?`, answer: `${a ** 3}` };
    return { question: `가로 ${a} cm, 세로 ${b} cm, 높이 ${c} cm 인 직육면체의 부피는 몇 cm³ 입니까?`, answer: `${a * b * c}` };
  },
  mean: () => {
    // 평균 m 을 먼저 정하고 차이의 합이 0 이 되게
    const n = rnd(4, 5), m = rnd(5, 20);
    const diffs = [...Array(n - 1)].map(() => rnd(-4, 4));
    const last = -diffs.reduce((x, y) => x + y, 0);
    if (Math.abs(last) > 6 || diffs.every((d) => d === 0)) return null;
    const xs = [...diffs, last].map((d) => m + d);
    return { question: `${xs.join(", ")} 의 평균을 구하세요.`, answer: `${m}` };
  },
};

export const KNOWN_SHAPES = [...Object.keys(SHAPES), ...Object.keys(CALC)];
export const isEquationTemplate = (t: Pick<Template, "shape">) => t.shape in SHAPES;

type Row = Omit<Template, "level" | "targets" | "conceptId"> & { level: number; targets: string[]; concept_id?: string | null; active: boolean };

// SELECT * : concept_id 칸이 아직 없는 DB(07_diagnostic.sql 전)에서도 동작하게
export async function listTemplates(opts: { activeOnly?: boolean } = {}): Promise<Template[]> {
  const rows = await query<Row>(`SELECT * FROM problem_templates ORDER BY level, id`);
  return rows
    .filter((r) => !(opts.activeOnly ?? true) || r.active)
    .map((r) => ({
      id: r.id,
      shape: r.shape,
      pattern: r.pattern,
      grade: r.grade,
      unit: r.unit,
      concept: r.concept,
      sample: r.sample,
      targets: r.targets as ErrorType[],
      level: Math.min(3, Math.max(1, r.level)) as 1 | 2 | 3,
      ...(r.concept_id ? { conceptId: r.concept_id } : {}),
    }));
}

// 틀 하나로 문항 만들기 (검증 통과한 것만, exclude 에 있는 식은 빼고)
export function generateFromTemplate(t: Template, count: number, exclude: Set<string> = new Set()) {
  const out: { question: string; answer: string }[] = [];
  const calc = CALC[t.shape];
  if (calc) {
    for (let tries = 0; out.length < count && tries < 80; tries++) {
      const g = calc();
      const key = g?.question.replace(/\s/g, "");
      if (!g || !key || exclude.has(key)) continue;
      exclude.add(key);
      out.push(g);
    }
    return out;
  }
  const gen = SHAPES[t.shape];
  if (!gen) return [];
  for (let tries = 0; out.length < count && tries < 80; tries++) {
    const q = gen();
    if (!q) continue;
    try {
      const s = solveLinear(q);
      const key = s.question.replace(/\s/g, "");
      if (!Number.isInteger(s.answerValue) || s.answerValue === 0 || Math.abs(s.answerValue) > 30 || exclude.has(key)) continue;
      exclude.add(key);
      out.push({ question: s.question, answer: s.answer });
    } catch {
      // 해가 없거나 식이 깨지면 버린다
    }
  }
  return out;
}

// 약점에 맞는 틀 고르기: 연습시키는 오류가 맞으면 우선, 개념이 겹치면 다음. 둘 다 없으면 쉬운 틀 전체
// adapt(학습 프로필)가 있으면 이미 된 것은 뒤로 미룬다:
//  - 극복한 오류만 연습시키는 틀은 점수를 깎고, 익힌 틀은 맨 뒤로 (→ 자연스럽게 한 단계 어려운 틀부터)
//  - 잘하는 개념의 틀은 점수를 깎는다
export function rankTemplates(
  templates: Template[],
  weak: { targetError?: ErrorType | null; concept?: string | null },
  adapt?: Adapt,
) {
  return rankWithTier(templates, weak, adapt).map((s) => s.t);
}

function rankWithTier(
  templates: Template[],
  weak: { targetError?: ErrorType | null; concept?: string | null },
  adapt?: Adapt,
) {
  const words = conceptWords(weak.concept ?? "");
  const scored = templates.map((t) => {
    const base =
      (weak.targetError && t.targets.includes(weak.targetError) ? 10 - t.targets.indexOf(weak.targetError) : 0) +
      words.filter((w) => t.concept.includes(w)).length * 3;
    const fixed = adapt ? t.targets.filter((e) => adapt.overcome.has(e)).length : 0;
    const tWords = conceptWords(t.concept);
    const strong = adapt && tWords.length > 0 && tWords.every((w) => adapt.strongWords.has(w));
    const score = base - fixed * 4 - (strong ? 3 : 0);
    // 0: 연습할 것 / 1: 이미 된 것 위주(극복한 오류만 연습·잘하는 개념·깎고 나니 맞는 점이 없음) / 2: 익힌 틀
    const tier = adapt?.mastered.has(t.id) ? 2 : fixed === t.targets.length || strong || (adapt && score <= 0) ? 1 : 0;
    return { t, base, score, tier };
  });
  const order = (xs: typeof scored) => xs.sort((a, b) => a.tier - b.tier || a.t.level - b.t.level || b.score - a.score);
  const hits = order(scored.filter((s) => s.base > 0));
  // 약점에 딱 맞는 틀 다음에 나머지 틀도 (일차방정식은 어느 틀이든 이항·계산을 거친다) → 같은 틀을 되풀이하기 전에 다른 모양부터
  const rest = order(scored.filter((s) => s.base <= 0)).map((s) => ({ ...s, related: true }));
  return [...hits.map((s) => ({ ...s, related: false })), ...rest];
}

// 난이도를 섞어 고르는 순서: 쉬움·보통·어려움에서 하나씩 돌아가며 (앞쪽 틀만 몰리지 않게)
function spreadByLevel<T extends { t: Template }>(xs: T[]): T[] {
  const byLevel = [1, 2, 3].map((l) => xs.filter((x) => x.t.level === l));
  const out: T[] = [];
  for (let i = 0; out.length < xs.length; i++) for (const l of byLevel) if (l[i]) out.push(l[i]);
  return out;
}

// 약점에 맞는 문항 count 개: 쉬운 틀부터 한 문항씩 돌아가며 → 쉬움에서 어려움 순서
export async function pickFromBank(opts: {
  targetError?: ErrorType | null;
  concept?: string | null;
  count: number;
  exclude?: Set<string>;
  adapt?: Adapt;
  conceptIds?: string[]; // 주면 그 개념의 틀만 (이전 과정 복습). 없으면 일차방정식 틀만
  usedTemplates?: Set<string>; // 이미 고른 틀 → 맨 뒤로 (다른 틀을 다 쓴 뒤에만)
}): Promise<BankItem[]> {
  const all = await listTemplates();
  const pool = opts.conceptIds ? all.filter((t) => t.conceptId && opts.conceptIds!.includes(t.conceptId)) : all.filter(isEquationTemplate);
  // 약점에 맞는 틀(연습할 것)을 먼저, 그 안에서 난이도를 섞는다. 맞는 틀을 다 쓰면 나머지 틀 → 그래도 모자랄 때만 같은 틀을 숫자만 바꿔 다시
  const ordered = opts.conceptIds
    ? pool.map((t) => ({ t, tier: 0, related: false }))
    : (() => {
        const all = rankWithTier(pool, opts, opts.adapt);
        const main = all.filter((r) => !r.related && r.tier === 0);
        const other = all.filter((r) => !main.includes(r));
        return [...spreadByLevel(main), ...other];
      })();
  const used = opts.usedTemplates ?? new Set<string>();
  const ranked = [...ordered.filter((r) => !used.has(r.t.id)), ...ordered.filter((r) => used.has(r.t.id))];
  const tierOf = new Map(ranked.map((r) => [r.t.id, r.related ? 3 : r.tier]));
  const exclude = opts.exclude ?? new Set<string>();
  const items: BankItem[] = [];
  // 틀마다 한 문항씩 → 틀이 모자랄 때만 다음 바퀴에서 같은 틀을 다시 (숫자만 다른 문항)
  for (let round = 0; items.length < opts.count && round < 10; round++) {
    for (const { t } of ranked) {
      if (items.length >= opts.count) break;
      const [g] = generateFromTemplate(t, 1, exclude);
      if (!g) continue;
      const practiced = t.targets.map((e) => ERROR_LABEL[e] ?? e).join(", ");
      items.push({
        ...g,
        concept: t.concept,
        templateId: t.id,
        level: t.level,
        why: `문제은행 '${t.pattern}' 틀 · ${practiced} 연습 (${LEVEL_LABEL[t.level]})${opts.adapt?.mastered.has(t.id) ? " · 익힌 틀 복습" : ""}${round > 0 ? " · 같은 틀 한 번 더" : ""}`,
      });
    }
  }
  // 연습할 것 먼저, 그 안에서 쉬운 것부터. 이미 된 것·익힌 틀(복습)·나머지 틀은 뒤
  //  같은 틀 문항이 붙어 나오지 않게, 정렬 뒤 바로 앞과 같은 틀이면 다른 틀 문항과 자리를 바꾼다
  const sorted = items.sort((a, b) => (tierOf.get(a.templateId) ?? 0) - (tierOf.get(b.templateId) ?? 0) || a.level - b.level);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].templateId !== sorted[i - 1].templateId) continue;
    const j = sorted.findIndex((x, k) => k > i && x.templateId !== sorted[i - 1].templateId);
    if (j > 0) [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted;
}

// 그래프·점 그림 인식 테스트: 학생이 좌표평면에 손으로 그린 점·직선·포물선을 Claude 가 읽을 수 있는지 잰다.
//   정답을 알고 그린 손그림(흔들리는 획, 고르지 않은 눈금, 손글씨 숫자)을 만들어 Claude(claude -p, 구독)에게 읽히고 자동 채점한다.
//   그림 크기는 학생 제출 이미지와 같은 1000×680, 흰 바탕 검은 펜. 업스테이지 OCR 은 글자 전용이라 그림은 Claude 만 본다.
//   DB 에는 아무것도 쓰지 않는다. 그림과 결과는 data/graphbench/ 에 남긴다 (git 에 안 올라감).
//
//   npm run test:graph                      전체 (장면 13개 × 그리기 3가지 = 39번 호출, 이름이 hard- 인 5개는 일부러 어려운 것)
//   npm run test:graph -- --model=haiku     모델 바꾸기 (기본: .env VISION_MODEL 의 첫 모델, 없으면 sonnet)
//   npm run test:graph -- --only=line       이름에 line 이 들어간 장면만
//   npm run test:graph -- --style=ticks     그리기 방식 하나만 (numbers | ticks | rough)
//   npm run test:graph -- --render-only     그림만 만들고 Claude 는 부르지 않음 (눈으로 확인용)
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { runClaude } from "../src/lib/claudeCli";
import { env } from "../src/lib/env";

// ── 정답 장면 ─────────────────────────────────────────
type Pt = { label: string; x: number; y: number };
type Line = { a: number; b: number; from: number; to: number }; // y = ax + b, x 범위
type Parabola = { a: number; p: number; q: number; from: number; to: number }; // y = a(x - p)^2 + q
type Scene = { name: string; desc: string; points?: Pt[]; lines?: Line[]; parabolas?: Parabola[]; guides?: boolean };

const SCENES: Scene[] = [
  { name: "point-1", desc: "점 1개", points: [{ label: "A", x: 2, y: 3 }] },
  { name: "points-3", desc: "점 3개 (여러 사분면)", points: [{ label: "A", x: 1, y: 2 }, { label: "B", x: -3, y: 1 }, { label: "C", x: 2, y: -4 }] },
  { name: "points-guides", desc: "점 3개 + 축까지 점선", guides: true, points: [{ label: "A", x: 3, y: -2 }, { label: "B", x: -2, y: -3 }, { label: "C", x: -4, y: 2 }] },
  { name: "line-int", desc: "직선 y = 2x - 1", lines: [{ a: 2, b: -1, from: -1.6, to: 3.1 }] },
  { name: "line-frac", desc: "직선 y = -1/2 x + 2", lines: [{ a: -0.5, b: 2, from: -5.5, to: 5.5 }] },
  { name: "line-two", desc: "직선 2개 y = x + 1, y = -x + 3", lines: [{ a: 1, b: 1, from: -5.5, to: 4 }, { a: -1, b: 3, from: -2, to: 5.5 }] },
  { name: "parabola-up", desc: "포물선 y = (x - 1)^2 - 3", parabolas: [{ a: 1, p: 1, q: -3, from: -1.6, to: 3.6 }] },
  { name: "parabola-down", desc: "포물선 y = -x^2 + 4", parabolas: [{ a: -1, p: 0, q: 4, from: -2.6, to: 2.6 }] },
  // 어려운 것: '예쁜' 값이 아니거나, 붙어 있거나, 겹쳐 있어서 짐작으로는 못 맞히는 것
  { name: "hard-points-5", desc: "[어려움] 점 5개 (붙은 점·축 위의 점)", points: [{ label: "A", x: 1, y: 1 }, { label: "B", x: 2, y: 1 }, { label: "C", x: -1, y: -1 }, { label: "D", x: 0, y: 3 }, { label: "E", x: -5, y: 4 }] },
  { name: "hard-line-third", desc: "[어려움] 직선 y = 1/3 x - 2", lines: [{ a: 1 / 3, b: -2, from: -6.5, to: 6.5 }] },
  { name: "hard-line-steep", desc: "[어려움] 직선 y = -3x + 5", lines: [{ a: -3, b: 5, from: 0.2, to: 3.5 }] },
  { name: "hard-parabola-wide", desc: "[어려움] 포물선 y = 1/2 (x + 2)^2 + 1", parabolas: [{ a: 0.5, p: -2, q: 1, from: -6.2, to: 1.6 }] },
  { name: "hard-mixed", desc: "[어려움] 직선 y = x - 2 + 포물선 y = x^2 - 4 + 교점 A(2, 0)·B(-1, -3)", lines: [{ a: 1, b: -2, from: -3.5, to: 6.5 }], parabolas: [{ a: 1, p: 0, q: -4, from: -2.9, to: 2.9 }], points: [{ label: "A", x: 2, y: 0 }, { label: "B", x: -1, y: -3 }] },
];

// 그리기 방식: numbers 눈금마다 숫자 / ticks 눈금만 (원점에서 세야 함) / rough 숫자는 있지만 눈금 간격·기울기·흔들림이 큼
type Style = "numbers" | "ticks" | "rough";
const STYLES: Record<Style, { desc: string; numbers: boolean; tickNoise: number; wobble: number; tilt: number }> = {
  numbers: { desc: "눈금+숫자", numbers: true, tickNoise: 3, wobble: 1.5, tilt: 0 },
  ticks: { desc: "눈금만", numbers: false, tickNoise: 3, wobble: 1.5, tilt: 0 },
  rough: { desc: "거친 손그림", numbers: true, tickNoise: 7, wobble: 3.5, tilt: 3 },
};

// ── 손그림 만들기 ─────────────────────────────────────
const W = 1000, H = 680, OX = 500, OY = 340, UNIT = 50, XMAX = 7, YMAX = 5.6;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

type P = [number, number];
type Stroke = P[];

// 고르지 않은 손그림 좌표계: 눈금 위치마다 오차가 있고(학생이 눈대중으로 찍음), 전체가 살짝 기울 수 있다
function makeFrame(r: () => number, s: (typeof STYLES)[Style]) {
  const tx = new Map<number, number>(), ty = new Map<number, number>();
  for (let i = -XMAX; i <= XMAX; i++) tx.set(i, OX + i * UNIT + (i ? gauss(r) * s.tickNoise : 0));
  for (let i = -6; i <= 6; i++) ty.set(i, OY - i * UNIT + (i ? gauss(r) * s.tickNoise : 0));
  // 정수 사이는 양옆 눈금 사이를 선형으로 (학생 눈금에 맞춰 그린다)
  const lerp = (m: Map<number, number>, v: number) => {
    const i = Math.floor(v), f = v - i;
    const a = m.get(i) ?? m.get(Math.sign(i) * 7)!, b = m.get(i + 1) ?? a + (m === tx ? UNIT : -UNIT);
    return a + (b - a) * f;
  };
  const tilt = ((gauss(r) * s.tilt) * Math.PI) / 180;
  const rot = ([x, y]: P): P => [OX + (x - OX) * Math.cos(tilt) - (y - OY) * Math.sin(tilt), OY + (x - OX) * Math.sin(tilt) + (y - OY) * Math.cos(tilt)];
  return { tx, ty, toPx: (x: number, y: number): P => rot([lerp(tx, x), lerp(ty, y)]), rot };
}

// 흔들리는 획: 촘촘히 나눈 뒤 느리게 변하는 흔들림 + 작은 떨림
function wobbly(pts: P[], r: () => number, amp: number): Stroke {
  const out: P[] = [];
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / 4));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n, dd = d + len * t;
      const off = amp * (Math.sin(dd / 37 + ph[0]) + 0.5 * Math.sin(dd / 13 + ph[1])) + gauss(r) * amp * 0.25;
      out.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
    }
    d += len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 한 획 글자 (높이 1, 위가 0). 숫자 1~5, -, O, x, y, A~C, P
const GLYPHS: Record<string, P[][]> = {
  "1": [[[0.15, 0.2], [0.35, 0], [0.35, 1]]],
  "2": [[[0.02, 0.25], [0.12, 0.05], [0.32, 0], [0.5, 0.12], [0.5, 0.35], [0, 1], [0.58, 1]]],
  "3": [[[0.03, 0.12], [0.28, 0], [0.52, 0.15], [0.45, 0.4], [0.22, 0.48], [0.52, 0.6], [0.55, 0.85], [0.3, 1], [0.02, 0.9]]],
  "4": [[[0.42, 1], [0.42, 0], [0, 0.68], [0.6, 0.68]]],
  "5": [[[0.52, 0], [0.1, 0], [0.06, 0.45], [0.32, 0.38], [0.55, 0.55], [0.52, 0.86], [0.28, 1], [0.02, 0.9]]],
  "-": [[[0, 0.55], [0.38, 0.55]]],
  O: [Array.from({ length: 17 }, (_, i) => [0.3 + 0.3 * Math.sin((i / 16) * 6.4), 0.5 - 0.5 * Math.cos((i / 16) * 6.4)] as P)],
  x: [[[0, 0.35], [0.45, 1]], [[0.45, 0.35], [0, 1]]],
  y: [[[0, 0.35], [0.25, 0.75]], [[0.5, 0.35], [0.12, 1.25]]],
  A: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.12, 0.62], [0.48, 0.62]]],
  B: [[[0, 0], [0, 1]], [[0, 0], [0.38, 0.05], [0.42, 0.25], [0, 0.47]], [[0, 0.47], [0.48, 0.6], [0.48, 0.9], [0, 1]]],
  C: [Array.from({ length: 12 }, (_, i) => [0.32 + 0.32 * Math.cos(0.8 + (i / 11) * 4.7), 0.5 - 0.5 * Math.sin(0.8 + (i / 11) * 4.7)] as P)],
  P: [[[0, 1], [0, 0], [0.4, 0.03], [0.45, 0.25], [0, 0.48]]],
  D: [[[0, 0], [0, 1]], [[0, 0], [0.3, 0.05], [0.5, 0.3], [0.5, 0.7], [0.3, 0.95], [0, 1]]],
  E: [[[0.5, 0], [0, 0], [0, 1], [0.5, 1]], [[0, 0.5], [0.4, 0.5]]],
};
function text(s: string, x: number, y: number, size: number, r: () => number, amp: number): Stroke[] {
  const out: Stroke[] = [];
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`글자 없음: ${ch}`);
    const slant = 0.12 + gauss(r) * 0.05, sz = size * (1 + gauss(r) * 0.05);
    for (const st of g) out.push(wobbly(st.map(([u, v]) => [cx + (u + slant * (1 - v)) * sz, y + v * sz + gauss(r) * 0.6] as P), r, amp * 0.25));
    cx += (Math.max(...g.flat().map((p) => p[0])) + 0.32) * sz;
  }
  return out;
}

function drawScene(scene: Scene, style: Style, seed: number): Stroke[] {
  const s = STYLES[style];
  const r = rng(seed);
  const f = makeFrame(r, s);
  const strokes: Stroke[] = [];
  const add = (pts: P[], amp = s.wobble) => strokes.push(wobbly(pts.map(f.rot), r, amp));
  // 축 (화살표) + 눈금 + 숫자 + O, x, y
  add([[OX - XMAX * UNIT - 20, OY + gauss(r) * 2], [OX + XMAX * UNIT + 20, OY + gauss(r) * 2]]);
  add([[OX + XMAX * UNIT + 8, OY - 8], [OX + XMAX * UNIT + 20, OY], [OX + XMAX * UNIT + 8, OY + 8]], 0.5);
  add([[OX + gauss(r) * 2, OY + YMAX * UNIT + 20], [OX + gauss(r) * 2, OY - YMAX * UNIT - 20]]);
  add([[OX - 8, OY - YMAX * UNIT - 8], [OX, OY - YMAX * UNIT - 20], [OX + 8, OY - YMAX * UNIT - 8]], 0.5);
  for (let i = -XMAX + 1; i <= XMAX - 1; i++) {
    if (!i) continue;
    const x = f.tx.get(i)!;
    add([[x, OY - 6], [x, OY + 6]], 0.4);
    if (s.numbers && Math.abs(i) <= 5) strokes.push(...text(String(i), x - (i < 0 ? 12 : 5), OY + 12, 16, r, s.wobble).map((st) => st.map(f.rot)));
  }
  for (let i = -5; i <= 5; i++) {
    if (!i) continue;
    const y = f.ty.get(i)!;
    add([[OX - 6, y], [OX + 6, y]], 0.4);
    if (s.numbers) strokes.push(...text(String(i), OX - (i < 0 ? 34 : 22), y - 8, 16, r, s.wobble).map((st) => st.map(f.rot)));
  }
  strokes.push(...[...text("O", OX - 22, OY + 8, 16, r, s.wobble), ...text("x", OX + XMAX * UNIT + 8, OY + 14, 18, r, s.wobble), ...text("y", OX + 12, OY - YMAX * UNIT - 26, 18, r, s.wobble)].map((st) => st.map(f.rot)));

  // 점: 펜으로 꾹 찍은 작은 원 + 이름. 점선 안내선(축까지)
  for (const p of scene.points ?? []) {
    const [px, py] = f.toPx(p.x + gauss(r) * 0.04, p.y + gauss(r) * 0.04);
    strokes.push(Array.from({ length: 9 }, (_, i) => [px + 3 * Math.cos(i * 0.8), py + 3 * Math.sin(i * 0.8)] as P));
    strokes.push(...text(p.label, px + 8, py - 26, 20, r, s.wobble));
    if (scene.guides) {
      const [ax] = f.toPx(p.x, 0), [, ay] = f.toPx(0, p.y);
      const [, oy] = f.toPx(p.x, 0), [ox] = f.toPx(0, p.y);
      for (const [from, to] of [[[px, py], [ax, oy]], [[px, py], [ox, ay]]] as [P, P][]) {
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.floor(len / 14);
        for (let k = 0; k < n; k += 1) {
          const t0 = k / n, t1 = Math.min(1, t0 + 0.5 / n);
          strokes.push(wobbly([[from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0], [from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1]], r, 0.3));
        }
      }
    }
  }
  // 직선·포물선: 학생 눈금에 맞춰 그린다 (그래도 손이 흔들린다)
  const curve = (fn: (x: number) => number, from: number, to: number) => {
    const pts: P[] = [];
    for (let x = from; x <= to + 1e-9; x += 0.1) {
      const y = fn(x);
      if (Math.abs(y) <= YMAX) pts.push(f.toPx(x, y));
    }
    if (pts.length > 1) strokes.push(wobbly(pts, r, s.wobble * 1.3));
  };
  for (const l of scene.lines ?? []) curve((x) => l.a * x + l.b, l.from, l.to);
  for (const q of scene.parabolas ?? []) curve((x) => q.a * (x - q.p) ** 2 + q.q, q.from, q.to);
  return strokes;
}

async function render(strokes: Stroke[]): Promise<Buffer> {
  const paths = strokes
    .map((st) => `<polyline points="${(st.length === 1 ? [st[0], st[0]] : st).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/><g fill="none" stroke="#2d2b26" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Claude 에게 읽히기 ────────────────────────────────
const SYSTEM = "너는 학생이 손으로 그린 수학 그림을 읽는 도구다. Read 도구로 이미지 파일을 열어 보고, 요청한 JSON만 출력한다.";
const PROMPT = `학생이 손으로 그린 좌표평면 그림이다. 가로축은 x, 세로축은 y, 원점은 O, 눈금 한 칸은 1이다 (눈금에 숫자가 없으면 원점에서 눈금 수를 센다).
학생이 그린 것을 그대로 읽는다 (맞는지 판단하지 않는다):
- 점: 이름(알파벳)과 좌표. 눈금에 맞춰 찍은 점이니 가장 가까운 정수로 쓴다.
- 직선: y = ax + b 의 a, b (분수면 소수로).
- 포물선: y = a(x - p)^2 + q 의 a, p, q.
그려지지 않은 종류는 빈 배열.
JSON만 출력: {"points": [{"label": "A", "x": 0, "y": 0}], "lines": [{"a": 0, "b": 0}], "parabolas": [{"a": 0, "p": 0, "q": 0}]}`;

type Read = { points: Pt[]; lines: { a: number; b: number }[]; parabolas: { a: number; p: number; q: number }[] };
async function readWithClaude(png: Buffer, model: string): Promise<{ read: Read | null; ms: number; error?: string }> {
  const t = Date.now();
  try {
    const text = await runClaude(`${PROMPT}\n다른 말 없이 JSON만 출력한다.`, { model, images: [png], system: SYSTEM });
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Partial<Read>;
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
    return {
      ms: Date.now() - t,
      read: {
        points: (j.points ?? []).map((p) => ({ label: String(p.label ?? "").toUpperCase(), x: num(p.x), y: num(p.y) })),
        lines: (j.lines ?? []).map((l) => ({ a: num(l.a), b: num(l.b) })),
        parabolas: (j.parabolas ?? []).map((q) => ({ a: num(q.a), p: num(q.p), q: num(q.q) })),
      },
    };
  } catch (e) {
    return { read: null, ms: Date.now() - t, error: (e as Error).message.slice(0, 120) };
  }
}

// ── 채점 ──────────────────────────────────────────────
// 학생 답으로 쓸 수 있을 만큼 정확해야 맞음 (1/3 과 1/4, a=1 과 0.8 은 다른 답):
//  점: 이름이 같고 x·y 가 0.25 이내 (정수 눈금). 직선: 기울기 0.05 · y절편 0.15 이내 (1/3 을 0.33 으로 읽어도 됨). 포물선: 꼭짓점 0.15 · a 0.1 이내
// 정답에 없는 것을 읽었으면 '없는 것을 읽음'으로 따로 센다
type Item = { kind: "점" | "직선" | "포물선"; truth: string; got: string; ok: boolean };
const close = (a: number, b: number, tol: number) => Number.isFinite(a) && Math.abs(a - b) <= tol;
function grade(scene: Scene, read: Read | null): { items: Item[]; extra: number } {
  const items: Item[] = [];
  const used = new Set<object>();
  for (const p of scene.points ?? []) {
    const g = read?.points.find((x) => x.label === p.label);
    if (g) used.add(g);
    items.push({ kind: "점", truth: `${p.label}(${p.x}, ${p.y})`, got: g ? `${g.label}(${g.x}, ${g.y})` : "못 읽음", ok: !!g && close(g.x, p.x, 0.25) && close(g.y, p.y, 0.25) });
  }
  for (const l of scene.lines ?? []) {
    const g = [...(read?.lines ?? [])].filter((x) => !used.has(x)).sort((u, v) => Math.abs(u.a - l.a) + Math.abs(u.b - l.b) - (Math.abs(v.a - l.a) + Math.abs(v.b - l.b)))[0];
    if (g) used.add(g);
    items.push({ kind: "직선", truth: `y=${+l.a.toFixed(3)}x${l.b < 0 ? "" : "+"}${l.b}`, got: g ? `y=${g.a}x${g.b < 0 ? "" : "+"}${g.b}` : "못 읽음", ok: !!g && close(g.a, l.a, 0.05) && close(g.b, l.b, 0.15) });
  }
  for (const q of scene.parabolas ?? []) {
    const g = [...(read?.parabolas ?? [])].filter((x) => !used.has(x)).sort((u, v) => Math.abs(u.p - q.p) + Math.abs(u.q - q.q) - (Math.abs(v.p - q.p) + Math.abs(v.q - q.q)))[0];
    if (g) used.add(g);
    items.push({
      kind: "포물선",
      truth: `a=${q.a} 꼭짓점(${q.p}, ${q.q})`,
      got: g ? `a=${g.a} 꼭짓점(${g.p}, ${g.q})` : "못 읽음",
      ok: !!g && close(g.p, q.p, 0.15) && close(g.q, q.q, 0.15) && close(g.a, q.a, 0.1),
    });
  }
  const all = [...(read?.points ?? []), ...(read?.lines ?? []), ...(read?.parabolas ?? [])];
  return { items, extra: all.filter((x) => !used.has(x)).length };
}

// ── 실행 ──────────────────────────────────────────────
async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const model = arg("model") ?? (env("VISION_MODEL") ?? "sonnet").split(",")[0].trim();
  const only = arg("only");
  const styles = (arg("style") ? [arg("style")] : Object.keys(STYLES)) as Style[];
  const renderOnly = process.argv.includes("--render-only");
  const dir = path.resolve("data/graphbench");
  mkdirSync(dir, { recursive: true });

  const jobs = SCENES.filter((s) => !only || s.name.includes(only)).flatMap((scene, si) => styles.map((style) => ({ scene, style, seed: 1000 + si * 10 + Object.keys(STYLES).indexOf(style) })));
  for (const j of jobs) writeFileSync(path.join(dir, `${j.style}-${j.scene.name}.png`), await render(drawScene(j.scene, j.style, j.seed)));
  console.log(`그림 ${jobs.length}장 → ${dir}`);
  if (renderOnly) return;

  console.log(`Claude(${model})로 읽는 중… (3개씩 동시에)`);
  const results: { scene: Scene; style: Style; items: Item[]; extra: number; ms: number; error?: string; read: Read | null }[] = [];
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        const png = await render(drawScene(j.scene, j.style, j.seed));
        const { read, ms, error } = await readWithClaude(png, model);
        results.push({ scene: j.scene, style: j.style, ...grade(j.scene, read), ms, error, read });
        process.stdout.write(".");
      }
    }),
  );
  console.log("\n");

  const order = (r: (typeof results)[number]) => SCENES.indexOf(r.scene) * 10 + Object.keys(STYLES).indexOf(r.style);
  results.sort((a, b) => order(a) - order(b));
  for (const r of results) {
    const ok = r.items.every((i) => i.ok) && !r.extra && !r.error;
    console.log(`${ok ? "✓" : "✗"} ${r.scene.desc} · ${STYLES[r.style].desc}  (${(r.ms / 1000).toFixed(1)}초)${r.error ? `  오류: ${r.error}` : ""}`);
    for (const i of r.items) if (!i.ok || !ok) console.log(`    ${i.ok ? "✓" : "✗"} ${i.kind} 정답 ${i.truth}  →  읽음 ${i.got}`);
    if (r.extra) console.log(`    ✗ 없는 것을 ${r.extra}개 더 읽음`);
  }

  const pct = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : "-");
  const items = results.flatMap((r) => r.items.map((i) => ({ ...i, style: r.style })));
  console.log(`\n━━━━ 결과 (${model}, 그림 ${results.length}장) ━━━━`);
  console.log(`  그림 전체가 맞음:  ${pct(results.filter((r) => r.items.every((i) => i.ok) && !r.extra && !r.error).length, results.length)}`);
  console.log(`  항목 정확도:       ${pct(items.filter((i) => i.ok).length, items.length)}`);
  for (const k of ["점", "직선", "포물선"] as const) console.log(`    ${k.padEnd(4)} ${pct(items.filter((i) => i.kind === k && i.ok).length, items.filter((i) => i.kind === k).length)}`);
  for (const s of styles) console.log(`  ${STYLES[s].desc.padEnd(8)} ${pct(items.filter((i) => i.style === s && i.ok).length, items.filter((i) => i.style === s).length)}`);
  console.log(`  없는 것을 읽음:    ${results.reduce((n, r) => n + r.extra, 0)}개 · 평균 ${(results.reduce((n, r) => n + r.ms, 0) / results.length / 1000).toFixed(1)}초/장`);
  writeFileSync(path.join(dir, `result-${model}.json`), JSON.stringify(results.map((r) => ({ scene: r.scene.name, style: r.style, read: r.read, items: r.items, extra: r.extra, ms: r.ms, error: r.error })), null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error("✗", e.message); process.exit(1); });

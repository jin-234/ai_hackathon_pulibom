// 문항 그림 (problems.figure JSON). 화면·서버 둘 다 쓴다. DB 를 import 하지 않는다
//  - geo:   평면도형·좌표평면·함수 그래프. AI 는 좌표만 정하고 그림은 FigureView 가 그린다 (길이·각이 수학적으로 정확)
//  - solid: 입체도형 틀 (직육면체·각기둥·각뿔·원기둥·원뿔·원뿔대·구). 치수만 주면 겨냥도로 그린다 (안 보이는 모서리는 점선)
//  - image: 선생님이 올린 그림 (problem_images 테이블, /api/problem-images/[id])
// sanitizeFigure: AI·교사가 준 값을 검사해 그릴 수 있는 그림만 남긴다. 길이·각 표시가 좌표와 안 맞으면 버린다

export type GeoPoint = { name: string; x: number; y: number; hide?: boolean }; // hide: 이름을 안 씀 (보조점)
export type GeoFigure = {
  type: "geo";
  axes?: { x: [number, number]; y: [number, number]; grid?: boolean }; // 있으면 좌표평면 (눈금·원점 O)
  points?: GeoPoint[];
  segments?: { a: string; b: string; label?: string; dashed?: boolean }[]; // 점 이름으로
  polygons?: { vertices: string[]; shade?: boolean }[];
  circles?: { center: string; r: number; label?: string; dashed?: boolean }[];
  angles?: { a: string; o: string; b: string; label?: string; right?: boolean }[]; // 각 AOB (꼭짓점 o)
  sectors?: { center: string; a: string; b: string; major?: boolean }[]; // 부채꼴 AOB (색칠, 기본은 작은 쪽)
  lines?: { a: string; b: string; label?: string }[]; // 두 점을 지나는 직선 (좌표평면 끝까지)
  graphs?: { expr: string; label?: string; from?: number; to?: number; dashed?: boolean }[]; // y = expr (x 의 식)
};
export type SolidShape = "cuboid" | "prism" | "pyramid" | "cylinder" | "cone" | "frustum" | "sphere";
export type SolidFigure = {
  type: "solid";
  shape: SolidShape;
  width?: number; // 직육면체·사각뿔 밑면 가로
  depth?: number; // 직육면체·사각뿔 밑면 세로
  height?: number;
  sides?: number; // 각기둥·각뿔 밑면의 변 수 (3~8)
  side?: number; // 각기둥·각뿔 밑면 한 변
  radius?: number; // 원기둥·원뿔·구·원뿔대(아래)
  topRadius?: number; // 원뿔대 위
  labels?: Partial<Record<"width" | "depth" | "height" | "side" | "radius" | "topRadius" | "slant", string>>;
  vertexNames?: string[]; // 꼭짓점 이름 (밑면 → 윗면/꼭대기 순)
};
export type ImageFigure = { type: "image"; imageId: string; alt?: string };
export type Figure = GeoFigure | SolidFigure | ImageFigure;

export const IMAGE_ID = /^img_[a-z0-9]{6,32}$/;
const SOLIDS: SolidShape[] = ["cuboid", "prism", "pyramid", "cylinder", "cone", "frustum", "sphere"];
const LIMIT = 100; // 좌표·치수 절댓값 상한

// ── 수식 (함수 그래프): + - * / ^, 괄호, x, π·pi, sqrt·√·abs, 곱셈 기호 생략 (2x, 2(x+1), x(x-1)) ──
type Fn = (x: number) => number;
export function compileExpr(src: string): Fn | null {
  const s = src
    .replace(/\s/g, "")
    .replace(/^y=/, "")
    .replace(/[−–]/g, "-")
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π|pi/g, "p")
    .replace(/sqrt|√/g, "r")
    .replace(/abs/g, "a");
  if (!s || s.length > 80 || !/^[0-9.xpra+\-*/^()|]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  // 곱셈이 생략됐는지: 다음 글자가 수·x·괄호·함수로 시작
  const startsTerm = () => /[0-9.xpra(|]/.test(peek() ?? "");
  function expr(): Fn {
    let f = term();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const g = term();
      const a = f;
      f = op === "+" ? (x) => a(x) + g(x) : (x) => a(x) - g(x);
    }
    return f;
  }
  function term(): Fn {
    let f = unary();
    for (;;) {
      if (peek() === "*" || peek() === "/") {
        const op = s[i++];
        const g = unary();
        const a = f;
        f = op === "*" ? (x) => a(x) * g(x) : (x) => a(x) / g(x);
      } else if (startsTerm()) {
        const g = power();
        const a = f;
        f = (x) => a(x) * g(x);
      } else return f;
    }
  }
  function unary(): Fn {
    if (peek() === "-") {
      i++;
      const g = unary();
      return (x) => -g(x);
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return power();
  }
  function power(): Fn {
    const base = atom();
    if (peek() === "^") {
      i++;
      const e = unary(); // 오른쪽 결합 (2^-1 허용)
      return (x) => Math.pow(base(x), e(x));
    }
    return base;
  }
  function atom(): Fn {
    const c = peek();
    if (c === undefined) throw new Error("end");
    if (c === "(") {
      i++;
      const f = expr();
      if (s[i++] !== ")") throw new Error(")");
      return f;
    }
    if (c === "|") {
      i++;
      const f = expr();
      if (s[i++] !== "|") throw new Error("|");
      return (x) => Math.abs(f(x));
    }
    if (c === "x") {
      i++;
      return (x) => x;
    }
    if (c === "p") {
      i++;
      return () => Math.PI;
    }
    if (c === "r" || c === "a") {
      i++;
      const g = atom(); // sqrt(…) · √x · abs(…)
      return c === "r" ? (x) => Math.sqrt(g(x)) : (x) => Math.abs(g(x));
    }
    const m = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (!m) throw new Error(`bad ${c}`);
    i += m[0].length;
    const v = Number(m[0]);
    return () => v;
  }
  try {
    const f = expr();
    if (i !== s.length) return null;
    return f;
  } catch {
    return null;
  }
}

// ── 검사 ──
const num = (v: unknown, lo = -LIMIT, hi = LIMIT) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const text = (v: unknown, max = 16) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const NAME = /^[A-Za-z][A-Za-z0-9']{0,2}$|^[가-힣]$/;
// 길이 표시에서 수만: "4 cm" → 4, "2√3" → 2√3 값, "x" → null
function labelValue(label: string | undefined): number | null {
  if (!label) return null;
  const t = label.replace(/\s|cm|mm|km|m(?![a-z])/g, "");
  if (!/^[0-9.√()+\-*/^]+$/.test(t)) return null;
  const f = compileExpr(t);
  const v = f ? f(0) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}
const degOf = (label: string | undefined) => {
  const m = label?.replace(/\s/g, "").match(/^(\d+(?:\.\d+)?)°$/);
  return m ? Number(m[1]) : null;
};

export type FigureCheck = { figure?: Figure; problem?: string };

export function sanitizeFigure(raw: unknown): FigureCheck {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  if (r.type === "image") {
    const id = typeof r.imageId === "string" && IMAGE_ID.test(r.imageId) ? r.imageId : null;
    return id ? { figure: { type: "image", imageId: id, ...(text(r.alt, 80) ? { alt: text(r.alt, 80) } : {}) } } : { problem: "그림 파일 정보가 이상해요" };
  }
  if (r.type === "solid") return sanitizeSolid(r);
  if (r.type === "geo") return sanitizeGeo(r);
  return { problem: "알 수 없는 그림 종류예요" };
}

function sanitizeSolid(r: Record<string, unknown>): FigureCheck {
  const shape = SOLIDS.includes(r.shape as SolidShape) ? (r.shape as SolidShape) : null;
  if (!shape) return { problem: "그릴 수 없는 입체도형이에요" };
  const pos = (v: unknown) => num(v, 0.1, LIMIT);
  const f: SolidFigure = { type: "solid", shape };
  for (const k of ["width", "depth", "height", "side", "radius", "topRadius"] as const) {
    const v = pos(r[k]);
    if (v !== undefined) f[k] = v;
  }
  const sides = num(r.sides, 3, 8);
  if (sides !== undefined) f.sides = Math.round(sides);
  const need: Record<SolidShape, (keyof SolidFigure)[]> = {
    cuboid: ["width", "depth", "height"],
    prism: ["height"],
    pyramid: ["height"],
    cylinder: ["radius", "height"],
    cone: ["radius", "height"],
    frustum: ["radius", "topRadius", "height"],
    sphere: ["radius"],
  };
  const missing = need[shape].filter((k) => f[k] === undefined);
  if (missing.length) return { problem: `입체도형 치수가 빠졌어요 (${missing.join(", ")})` };
  if ((shape === "prism" || shape === "pyramid") && f.sides === undefined && !(f.width && f.depth)) f.sides = 4;
  if (shape === "frustum" && f.topRadius! >= f.radius!) return { problem: "원뿔대의 윗면이 아랫면보다 커요" };
  if (r.labels && typeof r.labels === "object") {
    const labels: SolidFigure["labels"] = {};
    for (const [k, v] of Object.entries(r.labels as Record<string, unknown>))
      if (["width", "depth", "height", "side", "radius", "topRadius", "slant"].includes(k) && text(v)) labels[k as keyof typeof labels] = text(v);
    // 표시한 길이끼리 비율이 그린 치수와 맞는지 (예: 높이 10 · 반지름 3 인데 높이를 2 로 그림)
    const pairs = (["width", "depth", "height", "side", "radius", "topRadius"] as const)
      .map((k) => [f[k], labelValue(labels[k])] as const)
      .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== null);
    if (!ratiosAgree(pairs.map(([d, v]) => d / v))) return { problem: "입체도형 길이 표시와 그린 크기가 안 맞아요" };
    // 모선(빗변)과 높이·반지름이 피타고라스 정리로 맞는지 (원뿔·원뿔대·각뿔). 표시가 수일 때만
    const [lh, lr, lt, ls, lside] = [labelValue(labels.height), labelValue(labels.radius), labelValue(labels.topRadius), labelValue(labels.slant), labelValue(labels.side ?? labels.width)];
    const near = (x: number, y: number) => Math.abs(x - y) <= 0.03 * Math.max(x, y);
    if (lh && ls) {
      if (shape === "cone" && lr && !near(ls, Math.hypot(lh, lr))) return { problem: `원뿔의 모선 ${labels.slant} 이 높이·반지름과 안 맞아요` };
      if (shape === "frustum" && lr && lt && !near(ls, Math.hypot(lh, lr - lt))) return { problem: `원뿔대의 모선 ${labels.slant} 이 높이·반지름과 안 맞아요` };
      if (shape === "pyramid" && lside) {
        const n = f.sides ?? 4;
        const R = lside / (2 * Math.sin(Math.PI / n)); // 밑면 중심 → 꼭짓점
        const apo = lside / (2 * Math.tan(Math.PI / n)); // 밑면 중심 → 변의 가운데
        if (!near(ls, Math.hypot(lh, R)) && !near(ls, Math.hypot(lh, apo))) return { problem: `각뿔의 모서리·옆면의 높이 ${labels.slant} 가 높이·밑변과 안 맞아요` };
      }
    }
    if (lh && ls && ls <= lh) return { problem: "모선이 높이보다 길어야 해요" };
    if (Object.keys(labels).length) f.labels = labels;
  }
  if (Array.isArray(r.vertexNames)) {
    const names = r.vertexNames.map((n) => text(n, 3)).filter((n): n is string => !!n && NAME.test(n)).slice(0, 18);
    if (names.length) f.vertexNames = names;
  }
  return { figure: f };
}

const ratiosAgree = (ratios: number[]) => !ratios.length || Math.max(...ratios) / Math.min(...ratios) <= 1.12;

function sanitizeGeo(r: Record<string, unknown>): FigureCheck {
  const f: GeoFigure = { type: "geo" };
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? (v.slice(0, max) as Record<string, unknown>[]) : []);
  if (r.axes && typeof r.axes === "object") {
    const a = r.axes as Record<string, unknown>;
    const rng = (v: unknown): [number, number] | null =>
      Array.isArray(v) && num(v[0]) !== undefined && num(v[1]) !== undefined && (v[1] as number) - (v[0] as number) >= 2 ? [v[0] as number, v[1] as number] : null;
    const x = rng(a.x);
    const y = rng(a.y);
    if (!x || !y) return { problem: "좌표평면 범위가 이상해요" };
    f.axes = { x, y, ...(a.grid ? { grid: true } : {}) };
  }
  const pts = new Map<string, GeoPoint>();
  for (const p of arr(r.points, 26)) {
    const name = text(p.name, 3);
    const x = num(p.x);
    const y = num(p.y);
    if (!name || !NAME.test(name) || x === undefined || y === undefined || pts.has(name)) continue;
    pts.set(name, { name, x, y, ...(p.hide ? { hide: true } : {}) });
  }
  const has = (n: unknown): n is string => typeof n === "string" && pts.has(n);
  const segs = arr(r.segments, 40).filter((s) => has(s.a) && has(s.b) && s.a !== s.b);
  f.segments = segs.map((s) => ({ a: s.a as string, b: s.b as string, ...(text(s.label) ? { label: text(s.label) } : {}), ...(s.dashed ? { dashed: true } : {}) }));
  f.polygons = arr(r.polygons, 6)
    .map((p) => ({ vertices: (Array.isArray(p.vertices) ? p.vertices : []).filter(has).slice(0, 12) as string[], ...(p.shade ? { shade: true } : {}) }))
    .filter((p) => p.vertices.length >= 3);
  f.circles = arr(r.circles, 6)
    .filter((c) => has(c.center) && num(c.r, 0.05, LIMIT) !== undefined)
    .map((c) => ({ center: c.center as string, r: c.r as number, ...(text(c.label) ? { label: text(c.label) } : {}), ...(c.dashed ? { dashed: true } : {}) }));
  f.angles = arr(r.angles, 12)
    .filter((g) => has(g.a) && has(g.o) && has(g.b))
    .map((g) => ({ a: g.a as string, o: g.o as string, b: g.b as string, ...(text(g.label) ? { label: text(g.label) } : {}), ...(g.right ? { right: true } : {}) }));
  f.sectors = arr(r.sectors, 4)
    .filter((c) => has(c.center) && has(c.a) && has(c.b))
    .map((c) => ({ center: c.center as string, a: c.a as string, b: c.b as string, ...(c.major ? { major: true } : {}) }));
  f.lines = f.axes ? arr(r.lines, 6).filter((l) => has(l.a) && has(l.b) && l.a !== l.b).map((l) => ({ a: l.a as string, b: l.b as string, ...(text(l.label) ? { label: text(l.label) } : {}) })) : [];
  f.graphs = [];
  if (f.axes) {
    for (const g of arr(r.graphs, 4)) {
      const expr = typeof g.expr === "string" ? g.expr.trim() : "";
      if (!compileExpr(expr)) return { problem: `그래프 식을 읽을 수 없어요 (${expr.slice(0, 30)})` };
      f.graphs.push({
        expr,
        ...(text(g.label, 24) ? { label: text(g.label, 24) } : {}),
        ...(num(g.from) !== undefined ? { from: g.from as number } : {}),
        ...(num(g.to) !== undefined ? { to: g.to as number } : {}),
        ...(g.dashed ? { dashed: true } : {}),
      });
    }
  }
  f.points = [...pts.values()];
  for (const k of ["segments", "polygons", "circles", "angles", "sectors", "lines", "graphs", "points"] as const) if (!f[k]?.length) delete f[k];
  if (!f.points && !f.graphs) return { problem: "그림에 그릴 것이 없어요" };

  // 좌표와 표시가 맞는지: 길이 표시 비율, 직각 표시, 각도 표시, 점이 좌표평면 안에 있는지
  const P = (n: string) => pts.get(n)!;
  const dist = (a: string, b: string) => Math.hypot(P(a).x - P(b).x, P(a).y - P(b).y);
  const lens = (f.segments ?? []).flatMap((s) => {
    const v = labelValue(s.label);
    return v ? [dist(s.a, s.b) / v] : [];
  });
  for (const c of f.circles ?? []) {
    const v = labelValue(c.label);
    if (v) lens.push(c.r / v);
  }
  // 좌표평면에서는 좌표가 곧 길이라 비율이 1 이어야 한다
  if (f.axes ? lens.some((k) => Math.abs(k - 1) > 0.06) : !ratiosAgree(lens)) return { problem: "그림의 길이 표시가 좌표와 안 맞아요" };
  for (const c of f.sectors ?? []) {
    const [ra, rb] = [dist(c.center, c.a), dist(c.center, c.b)];
    if (Math.abs(ra - rb) > 0.02 * Math.max(ra, rb)) return { problem: `부채꼴 ${c.a}${c.center}${c.b} 의 두 반지름 길이가 달라요` };
  }
  for (const g of f.angles ?? []) {
    const o = P(g.o);
    const u = [P(g.a).x - o.x, P(g.a).y - o.y];
    const w = [P(g.b).x - o.x, P(g.b).y - o.y];
    const deg = (Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]) || 1)))) * 180) / Math.PI;
    if (g.right && Math.abs(deg - 90) > 2) return { problem: `∠${g.a}${g.o}${g.b} 직각 표시가 실제로는 ${Math.round(deg)}°예요` };
    const want = degOf(g.label);
    if (want !== null && Math.abs(deg - want) > 3) return { problem: `∠${g.a}${g.o}${g.b} 를 ${want}° 라고 했는데 그림은 ${Math.round(deg)}°예요` };
  }
  if (f.axes) {
    const out = (f.points ?? []).find((p) => p.x < f.axes!.x[0] || p.x > f.axes!.x[1] || p.y < f.axes!.y[0] || p.y > f.axes!.y[1]);
    if (out) return { problem: `점 ${out.name} 이 좌표평면 범위 밖이에요` };
  }
  return { figure: f };
}

// ── 채점·검산 AI 에게 넘기는 그림 설명 (그림을 글로) ──
export function describeFigure(fig: Figure | undefined): string {
  if (!fig) return "";
  if (fig.type === "image") return `(선생님이 올린 그림 이미지${fig.alt ? `: ${fig.alt}` : ""}. 그림 내용은 문제 글·정답·해설을 기준으로 판단)`;
  if (fig.type === "solid") {
    const name: Record<SolidShape, string> = { cuboid: "직육면체", prism: `${fig.sides ?? 4}각기둥`, pyramid: `${fig.sides ?? 4}각뿔`, cylinder: "원기둥", cone: "원뿔", frustum: "원뿔대", sphere: "구" };
    const dims = (["width", "depth", "height", "side", "radius", "topRadius"] as const)
      .filter((k) => fig.labels?.[k] ?? fig[k])
      .map((k) => `${{ width: "가로", depth: "세로", height: "높이", side: "밑면 한 변", radius: "반지름", topRadius: "윗면 반지름" }[k]} ${fig.labels?.[k] ?? fig[k]}`);
    if (fig.labels?.slant) dims.push(`모선 ${fig.labels.slant}`);
    return `${name[fig.shape]}${dims.length ? ` (${dims.join(", ")})` : ""}`;
  }
  const parts: string[] = [];
  if (fig.axes) parts.push(`좌표평면 (x: ${fig.axes.x[0]}~${fig.axes.x[1]}, y: ${fig.axes.y[0]}~${fig.axes.y[1]})`);
  if (fig.points?.length) parts.push(`점 ${fig.points.map((p) => `${p.name}(${p.x}, ${p.y})`).join(", ")}`);
  if (fig.segments?.length) parts.push(`선분 ${fig.segments.map((s) => `${s.a}${s.b}${s.label ? `=${s.label}` : ""}`).join(", ")}`);
  if (fig.polygons?.length) parts.push(`도형 ${fig.polygons.map((p) => p.vertices.join("")).join(", ")}`);
  if (fig.circles?.length) parts.push(`원 ${fig.circles.map((c) => `중심 ${c.center} 반지름 ${c.label ?? c.r}`).join(", ")}`);
  if (fig.sectors?.length) parts.push(`부채꼴 ${fig.sectors.map((c) => `${c.a}${c.center}${c.b}`).join(", ")}`);
  if (fig.angles?.length) parts.push(`각 ${fig.angles.map((g) => `∠${g.a}${g.o}${g.b}${g.right ? "=90°" : g.label ? `=${g.label}` : ""}`).join(", ")}`);
  if (fig.lines?.length) parts.push(`직선 ${fig.lines.map((l) => `${l.a}${l.b}`).join(", ")}`);
  if (fig.graphs?.length) parts.push(`그래프 ${fig.graphs.map((g) => `y = ${g.expr}${g.from !== undefined || g.to !== undefined ? ` (${g.from ?? ""}≤x≤${g.to ?? ""})` : ""}`).join(", ")}`);
  return parts.join(" / ");
}

// AI 출제 프롬프트에 넣는 그림 형식 설명
export const FIGURE_PROMPT = `- 도형·좌표·그래프·입체도형처럼 그림이 있어야 이해되는 문항은 "figure" 를 함께 준다. 그림이 필요 없으면 figure 를 쓰지 않는다. 그림을 넣으면 question 에 "그림과 같이" 처럼 그림을 가리켜도 된다.
  figure 는 그림 좌표만 정한다 (그림은 프로그램이 그린다). 길이·각 표시는 좌표와 정확히 맞아야 한다 (안 맞으면 문항을 버린다).
  · 평면도형: {"type": "geo", "points": [{"name": "A", "x": 0, "y": 0}, {"name": "B", "x": 4, "y": 0}, {"name": "C", "x": 0, "y": 3}], "polygons": [{"vertices": ["A", "B", "C"]}], "segments": [{"a": "A", "b": "B", "label": "4 cm"}, {"a": "A", "b": "C", "label": "3 cm"}], "angles": [{"a": "B", "o": "A", "b": "C", "right": true}]}
    (segments 의 label 은 문제에 주어진 길이만. 구하는 값은 그림에 답을 쓰지 말고 "x" 나 "?" 로 (답이 그림에 보이면 안 된다). 같은 길이를 여러 번 쓰지 않는다.
     angles: 꼭짓점 o, 직각이면 right, 각도면 label "60°". 원: circles [{"center": "O", "r": 5}]. 부채꼴: 중심·두 반지름 끝점으로 sectors [{"center": "O", "a": "A", "b": "B"}] (원 전체가 필요 없으면 circles 없이). 한 직선 위의 점들은 segments 를 겹치지 않게 이웃한 점끼리)
  · 좌표평면·그래프: {"type": "geo", "axes": {"x": [-5, 5], "y": [-5, 5], "grid": true}, "points": [{"name": "P", "x": 2, "y": 3}], "graphs": [{"expr": "x^2 - 2x - 3", "label": "y = x^2 - 2x - 3"}]}
    (expr 은 x 의 식: + - * / ^ 괄호 sqrt abs. 유리함수는 "6/x", 무리함수는 "sqrt(x - 1) + 2". lines: 두 점을 지나는 직선 [{"a": "A", "b": "B"}]. 좌표평면에서는 좌표가 곧 길이)
  · 입체도형: {"type": "solid", "shape": "cuboid|prism|pyramid|cylinder|cone|frustum|sphere", "width": 4, "depth": 3, "height": 5, "labels": {"width": "4 cm", "height": "5 cm"}}
    (각기둥·각뿔은 "sides": 밑면 변 수, "side": 한 변. 원기둥·원뿔·구는 "radius", 원뿔대는 "radius" 와 "topRadius". labels 키: width depth height side radius topRadius slant(모선))`;

import { useId } from "react";
import { compileExpr, type Figure, type GeoFigure, type SolidFigure } from "@/lib/figure";

// 문항 그림: 설계도(lib/figure.ts)를 SVG 로 그린다. 길이·각은 좌표 그대로라 수학적으로 정확하다
//  학생 문제 화면·출제 미리보기·교사 풀이 기록에서 같이 쓴다
export default function FigureView({ figure, className = "" }: { figure?: Figure | null; className?: string }) {
  if (!figure) return null;
  if (figure.type === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/problem-images/${figure.imageId}`}
        alt={figure.alt || "문제 그림"}
        className={`max-h-72 w-auto max-w-full rounded-xl border border-line bg-white object-contain ${className}`}
      />
    );
  return (
    <div className={`w-fit max-w-full rounded-xl border border-line bg-white p-2 text-ink ${className}`}>
      {figure.type === "geo" ? <Geo f={figure} /> : <Solid f={figure} />}
    </div>
  );
}

const W = 320; // 그림 최대 가로 (px). 화면이 좁으면 viewBox 로 줄어든다
const H = 260;
const PAD = 26; // 이름·길이 표시 자리
const FONT = 13;
type XY = { x: number; y: number };
const fmt = (n: number) => Math.round(n * 10) / 10;

// 점에서 기준점 반대 방향으로 d 만큼 (이름·길이 표시가 도형 안쪽에 겹치지 않게)
function away(p: XY, from: XY, d: number): XY {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}

function Label({ at, children, anchor = "middle" }: { at: XY; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={fmt(at.x)} y={fmt(at.y)} fontSize={FONT} textAnchor={anchor} dominantBaseline="middle" fill="currentColor" stroke="white" strokeWidth={3} paintOrder="stroke">
      {children}
    </text>
  );
}

// ── 평면도형·좌표평면·그래프 ──
function Geo({ f }: { f: GeoFigure }) {
  const uid = useId(); // 잘라내기 영역 이름: 서버·브라우저가 같은 값을 쓰게 (Math.random 이면 화면이 어긋났다는 경고가 뜬다)
  const pts = new Map((f.points ?? []).map((p) => [p.name, p]));
  // 수학 좌표 범위
  let x0: number, x1: number, y0: number, y1: number;
  if (f.axes) [[x0, x1], [y0, y1]] = [f.axes.x, f.axes.y];
  else {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of pts.values()) {
      xs.push(p.x);
      ys.push(p.y);
    }
    for (const c of f.circles ?? []) {
      const o = pts.get(c.center)!;
      xs.push(o.x - c.r, o.x + c.r);
      ys.push(o.y - c.r, o.y + c.r);
    }
    [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const m = Math.max(x1 - x0, y1 - y0, 1) * 0.06;
    [x0, x1, y0, y1] = [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  const s = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
  const vw = (x1 - x0) * s + 2 * PAD;
  const vh = (y1 - y0) * s + 2 * PAD;
  const to = (x: number, y: number): XY => ({ x: PAD + (x - x0) * s, y: PAD + (y1 - y) * s });
  const P = (n: string) => {
    const p = pts.get(n)!;
    return to(p.x, p.y);
  };
  // 이름·길이 표시를 밀어낼 기준: 도형 점들의 가운데 (좌표평면이면 각 점을 원점 반대쪽 위로)
  const named = [...pts.values()];
  const center = named.length ? to(named.reduce((a, p) => a + p.x, 0) / named.length, named.reduce((a, p) => a + p.y, 0) / named.length) : to(0, 0);
  const clip = `clip-${uid.replace(/[^\w-]/g, "")}`;
  const box = { l: PAD, r: PAD + (x1 - x0) * s, t: PAD, b: PAD + (y1 - y0) * s };

  return (
    <svg viewBox={`0 0 ${fmt(vw)} ${fmt(vh)}`} width={fmt(vw)} className="block h-auto max-w-full" role="img" aria-label="문제 그림">
      <defs>
        <clipPath id={clip}>
          <rect x={box.l} y={box.t} width={box.r - box.l} height={box.b - box.t} />
        </clipPath>
        <marker id={`${clip}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {f.axes && <Axes f={f} to={to} s={s} box={box} arrow={`${clip}-arrow`} />}
      {f.polygons?.map((pg, i) => (
        <polygon
          key={`pg${i}`}
          points={pg.vertices.map((v) => `${fmt(P(v).x)},${fmt(P(v).y)}`).join(" ")}
          fill={pg.shade ? "currentColor" : "none"}
          fillOpacity={pg.shade ? 0.1 : 0}
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ))}
      {f.circles?.map((c, i) => {
        const o = P(c.center);
        return <circle key={`c${i}`} cx={fmt(o.x)} cy={fmt(o.y)} r={fmt(c.r * s)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray={c.dashed ? "5 4" : undefined} />;
      })}
      {f.lines?.map((l, i) => {
        const [a, b] = [pts.get(l.a)!, pts.get(l.b)!];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const far = (x1 - x0 + y1 - y0) * 2;
        const len = Math.hypot(dx, dy);
        const p = to(a.x - (dx / len) * far, a.y - (dy / len) * far);
        const q = to(a.x + (dx / len) * far, a.y + (dy / len) * far);
        return <line key={`l${i}`} x1={fmt(p.x)} y1={fmt(p.y)} x2={fmt(q.x)} y2={fmt(q.y)} stroke="currentColor" strokeWidth={1.6} clipPath={`url(#${clip})`} />;
      })}
      {f.graphs?.map((g, i) => <Graph key={`g${i}`} g={g} color={GRAPH_COLORS[i % GRAPH_COLORS.length]} labelHere={f.graphs!.length === 1} range={{ x0, x1, y0, y1 }} to={to} clip={clip} />)}
      {/* 그래프가 여럿이면 색으로 구분하고 식은 왼쪽 위에 모아 쓴다 */}
      {(f.graphs?.length ?? 0) > 1 &&
        f.graphs!.map((g, i) =>
          g.label ? (
            <text key={`gl${i}`} x={box.l + 6} y={box.t + 12 + i * 16} fontSize={12} fill={GRAPH_COLORS[i % GRAPH_COLORS.length]} stroke="white" strokeWidth={3} paintOrder="stroke">
              {g.label}
            </text>
          ) : null,
        )}
      {f.sectors?.map((c, i) => {
        // 부채꼴: 중심 → 반지름 끝 A → 호 → B → 중심 (기본은 작은 쪽, major 면 큰 쪽)
        const [o, a, b] = [P(c.center), P(c.a), P(c.b)];
        const r = Math.hypot(a.x - o.x, a.y - o.y);
        const cross = (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const sweep = (cross > 0) !== !!c.major ? 1 : 0;
        return (
          <path
            key={`sc${i}`}
            d={`M${fmt(o.x)},${fmt(o.y)} L${fmt(a.x)},${fmt(a.y)} A${fmt(r)},${fmt(r)} 0 ${c.major ? 1 : 0} ${sweep} ${fmt(b.x)},${fmt(b.y)} Z`}
            fill="currentColor"
            fillOpacity={0.1}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        );
      })}
      {f.segments?.map((sg, i) => (
        <line key={`s${i}`} x1={fmt(P(sg.a).x)} y1={fmt(P(sg.a).y)} x2={fmt(P(sg.b).x)} y2={fmt(P(sg.b).y)} stroke="currentColor" strokeWidth={1.6} strokeDasharray={sg.dashed ? "5 4" : undefined} />
      ))}
      {f.circles?.map((c, i) => {
        // 반지름 표시: 중심에서 나가는 선분에 이미 길이를 썼으면 원에는 또 쓰지 않는다
        if (!c.label || f.segments?.some((sg) => sg.label && (sg.a === c.center || sg.b === c.center))) return null;
        const o = P(c.center);
        const rim = { x: o.x + c.r * s * 0.7071, y: o.y - c.r * s * 0.7071 };
        return <line key={`cl${i}`} x1={fmt(o.x)} y1={fmt(o.y)} x2={fmt(rim.x)} y2={fmt(rim.y)} stroke="currentColor" strokeWidth={1.2} />;
      })}
      {f.angles?.map((g, i) => <AngleMark key={`a${i}`} a={P(g.a)} o={P(g.o)} b={P(g.b)} right={g.right} />)}
      {named.map((p) =>
        p.hide ? null : <circle key={`p${p.name}`} cx={fmt(to(p.x, p.y).x)} cy={fmt(to(p.x, p.y).y)} r={2.6} fill="currentColor" />,
      )}
      {labels(f, P, s, center, named.filter((p) => !p.hide).map((p) => to(p.x, p.y))).map((l, i) => (
        <Label key={`t${i}`} at={l.at} anchor={l.anchor}>
          {l.text}
        </Label>
      ))}
    </svg>
  );
}

// ── 글자 자리 정하기: 길이·각도·점 이름이 서로, 그리고 점과 겹치지 않게 후보 자리 중 빈 곳을 고른다 ──
type Placed = { at: XY; text: string; anchor?: "start" | "middle" | "end" };
function labels(f: GeoFigure, P: (n: string) => XY, s: number, center: XY, dots: XY[]): Placed[] {
  const boxes: { x: number; y: number; w: number; h: number }[] = dots.map((d) => ({ x: d.x, y: d.y, w: 6, h: 6 }));
  // 선분·다각형 변·부채꼴 반지름·원 둘레도 피한다 (선 위에 글자가 얹히지 않게): 6px 마다 작은 칸
  const line = (a: XY, b: XY) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 0; k <= n; k++) boxes.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, w: 3, h: 3 });
  };
  for (const sg of f.segments ?? []) line(P(sg.a), P(sg.b));
  for (const pg of f.polygons ?? []) pg.vertices.forEach((v, k) => line(P(v), P(pg.vertices[(k + 1) % pg.vertices.length])));
  for (const c of f.sectors ?? []) {
    line(P(c.center), P(c.a));
    line(P(c.center), P(c.b));
  }
  for (const c of f.circles ?? []) {
    const o = P(c.center);
    for (let k = 0; k < 64; k++) boxes.push({ x: o.x + Math.cos((k * Math.PI) / 32) * c.r * s, y: o.y + Math.sin((k * Math.PI) / 32) * c.r * s, w: 3, h: 3 });
  }
  const width = (t: string) => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 13 : 7.5), 4);
  const out: Placed[] = [];
  const place = (cands: XY[], text: string, anchor: Placed["anchor"] = "middle") => {
    const w = width(text);
    const boxOf = (c: XY) => ({ x: anchor === "start" ? c.x + w / 2 : anchor === "end" ? c.x - w / 2 : c.x, y: c.y, w, h: 15 });
    const free = (b: ReturnType<typeof boxOf>) => boxes.every((o) => Math.abs(o.x - b.x) * 2 >= o.w + b.w || Math.abs(o.y - b.y) * 2 >= o.h + b.h);
    const at = cands.find((c) => free(boxOf(c))) ?? cands[cands.length - 1];
    boxes.push(boxOf(at));
    out.push({ at, text, anchor });
  };
  // 점 이름 먼저 (자리가 가장 중요), 그다음 각도·길이
  for (const p of f.points ?? []) {
    if (p.hide) continue;
    const at = P(p.name);
    const base = f.axes ? [{ x: at.x + 11, y: at.y - 11 }, { x: at.x - 11, y: at.y - 11 }, { x: at.x + 11, y: at.y + 13 }, { x: at.x - 11, y: at.y + 13 }] : [away(at, center, 14)];
    place([...base, { x: at.x, y: at.y - 15 }, { x: at.x, y: at.y + 16 }, { x: at.x + 12, y: at.y - 13 }, { x: at.x - 12, y: at.y + 14 }, away(at, center, 26)], p.name);
  }
  for (const g of f.angles ?? []) {
    if (!g.label || g.right) continue;
    const [a, o, b] = [P(g.a), P(g.o), P(g.b)];
    const u = { x: a.x - o.x, y: a.y - o.y };
    const w = { x: b.x - o.x, y: b.y - o.y };
    const ul = Math.hypot(u.x, u.y) || 1;
    const wl = Math.hypot(w.x, w.y) || 1;
    const r = Math.min(16, ul * 0.4, wl * 0.4);
    const bis = { x: u.x / ul + w.x / wl, y: u.y / ul + w.y / wl };
    const bl = Math.hypot(bis.x, bis.y) || 1;
    place([13, 22, 32].map((d) => ({ x: o.x + (bis.x / bl) * (r + d), y: o.y + (bis.y / bl) * (r + d) })), g.label);
  }
  for (const sg of f.segments ?? []) {
    if (!sg.label) continue;
    const [a, b] = [P(sg.a), P(sg.b)];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nl = Math.hypot(b.y - a.y, b.x - a.x) || 1;
    let n = { x: -(b.y - a.y) / nl, y: (b.x - a.x) / nl };
    // 도형 바깥쪽을 먼저
    if ((mid.x + n.x - center.x) ** 2 + (mid.y + n.y - center.y) ** 2 < (mid.x - n.x - center.x) ** 2 + (mid.y - n.y - center.y) ** 2) n = { x: -n.x, y: -n.y };
    place([13, -13, 27, -27].map((d) => ({ x: mid.x + n.x * d, y: mid.y + n.y * d })), sg.label);
  }
  for (const c of f.circles ?? []) {
    if (!c.label || f.segments?.some((sg) => sg.label && (sg.a === c.center || sg.b === c.center))) continue;
    const o = P(c.center);
    const m = { x: o.x + c.r * s * 0.354, y: o.y - c.r * s * 0.354 };
    place([{ x: m.x + 9, y: m.y + 7 }, { x: m.x - 9, y: m.y - 9 }], c.label, "start");
  }
  return out;
}

function Axes({ f, to, s, box, arrow }: { f: GeoFigure; to: (x: number, y: number) => XY; s: number; box: { l: number; r: number; t: number; b: number }; arrow: string }) {
  const [[x0, x1], [y0, y1]] = [f.axes!.x, f.axes!.y];
  const span = Math.max(x1 - x0, y1 - y0);
  const step = span <= 12 ? 1 : span <= 24 ? 2 : span <= 60 ? 5 : 10;
  const ticks = (a: number, b: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step) * step; v <= b; v += step) if (Math.abs(v) > 1e-9) out.push(Math.round(v * 1000) / 1000);
    return out;
  };
  const ox = Math.min(Math.max(0, x0), x1);
  const oy = Math.min(Math.max(0, y0), y1);
  const o = to(ox, oy);
  return (
    <g fontSize={11} fill="currentColor">
      {f.axes!.grid && (
        <g stroke="currentColor" strokeOpacity={0.12} strokeWidth={1}>
          {ticks(x0, x1).map((v) => (
            <line key={`gx${v}`} x1={fmt(to(v, 0).x)} y1={box.t} x2={fmt(to(v, 0).x)} y2={box.b} />
          ))}
          {ticks(y0, y1).map((v) => (
            <line key={`gy${v}`} x1={box.l} y1={fmt(to(0, v).y)} x2={box.r} y2={fmt(to(0, v).y)} />
          ))}
        </g>
      )}
      <line x1={box.l - 6} y1={fmt(o.y)} x2={box.r + 12} y2={fmt(o.y)} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${arrow})`} />
      <line x1={fmt(o.x)} y1={box.b + 6} x2={fmt(o.x)} y2={box.t - 12} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${arrow})`} />
      <text x={box.r + 14} y={fmt(o.y) + 14} fontSize={FONT} fontStyle="italic">
        x
      </text>
      <text x={fmt(o.x) + 8} y={box.t - 10} fontSize={FONT} fontStyle="italic">
        y
      </text>
      {ox === 0 && oy === 0 && (
        <text x={fmt(o.x) - 5} y={fmt(o.y) + 13} fontSize={12} textAnchor="end">
          O
        </text>
      )}
      {/* 눈금이 너무 촘촘하면 글자는 하나 걸러 */}
      {ticks(x0, x1)
        .filter((v, _, all) => all.length * 22 < (x1 - x0) * s || Math.round(v / step) % 2 === 0)
        .map((v) => (
          <g key={`tx${v}`}>
            <line x1={fmt(to(v, oy).x)} y1={fmt(o.y) - 3} x2={fmt(to(v, oy).x)} y2={fmt(o.y) + 3} stroke="currentColor" />
            <text x={fmt(to(v, oy).x)} y={fmt(o.y) + 14} textAnchor="middle" fillOpacity={0.75}>
              {v}
            </text>
          </g>
        ))}
      {ticks(y0, y1)
        .filter((v, _, all) => all.length * 16 < (y1 - y0) * s || Math.round(v / step) % 2 === 0)
        .map((v) => (
          <g key={`ty${v}`}>
            <line x1={fmt(o.x) - 3} y1={fmt(to(ox, v).y)} x2={fmt(o.x) + 3} y2={fmt(to(ox, v).y)} stroke="currentColor" />
            <text x={fmt(o.x) - 6} y={fmt(to(ox, v).y) + 4} textAnchor="end" fillOpacity={0.75}>
              {v}
            </text>
          </g>
        ))}
    </g>
  );
}

const GRAPH_COLORS = ["#3f6fb0", "#c0603a", "#4f8a4f", "#8a5bb0"];

function Graph({ g, color, labelHere, range, to, clip }: { g: NonNullable<GeoFigure["graphs"]>[number]; color: string; labelHere: boolean; range: { x0: number; x1: number; y0: number; y1: number }; to: (x: number, y: number) => XY; clip: string }) {
  const fn = compileExpr(g.expr);
  if (!fn) return null;
  const a = Math.max(range.x0, g.from ?? -Infinity);
  const b = Math.min(range.x1, g.to ?? Infinity);
  const span = range.y1 - range.y0;
  const N = 360;
  const parts: XY[][] = [[]];
  let prev: number | null = null;
  for (let i = 0; i <= N; i++) {
    const x = a + ((b - a) * i) / N;
    const y = fn(x);
    // 정의되지 않는 곳(√ 안이 음수, 0 으로 나눔)이나 점근선 근처의 큰 뜀은 선을 끊는다
    const ok = Number.isFinite(y) && y > range.y0 - span * 3 && y < range.y1 + span * 3;
    if (!ok || (prev !== null && Math.abs(y - prev) > span)) {
      if (parts[parts.length - 1].length) parts.push([]);
      prev = ok ? y : null;
      if (!ok) continue;
    }
    parts[parts.length - 1].push(to(x, y));
    prev = y;
  }
  const visible = parts.flat().filter((p) => p.y >= to(0, range.y1).y && p.y <= to(0, range.y0).y);
  const end = visible[visible.length - 1];
  return (
    <g>
      {parts
        .filter((p) => p.length > 1)
        .map((p, i) => (
          <polyline
            key={i}
            points={p.map((q) => `${fmt(q.x)},${fmt(q.y)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={g.dashed ? "6 4" : undefined}
            clipPath={`url(#${clip})`}
          />
        ))}
      {g.label && labelHere && end && (
        // 식 이름표: 그래프 끝 근처 안쪽
        <text x={fmt(Math.min(end.x, to(range.x1, 0).x) - 6)} y={fmt(Math.max(end.y, to(0, range.y1).y + 10) + 14)} fontSize={12} textAnchor="end" fill={color} stroke="white" strokeWidth={3} paintOrder="stroke">
          {g.label}
        </text>
      )}
    </g>
  );
}

// 각 표시: 호(또는 직각 네모)와 각도 글자
function AngleMark({ a, o, b, right }: { a: XY; o: XY; b: XY; right?: boolean }) {
  const u = { x: a.x - o.x, y: a.y - o.y };
  const w = { x: b.x - o.x, y: b.y - o.y };
  const ul = Math.hypot(u.x, u.y) || 1;
  const wl = Math.hypot(w.x, w.y) || 1;
  const r = Math.min(16, ul * 0.4, wl * 0.4);
  const p = { x: o.x + (u.x / ul) * r, y: o.y + (u.y / ul) * r };
  const q = { x: o.x + (w.x / wl) * r, y: o.y + (w.y / wl) * r };
  if (right) {
    const k = Math.min(10, r);
    const p2 = { x: o.x + (u.x / ul) * k, y: o.y + (u.y / ul) * k };
    const q2 = { x: o.x + (w.x / wl) * k, y: o.y + (w.y / wl) * k };
    const c = { x: p2.x + q2.x - o.x, y: p2.y + q2.y - o.y };
    return <polyline points={`${fmt(p2.x)},${fmt(p2.y)} ${fmt(c.x)},${fmt(c.y)} ${fmt(q2.x)},${fmt(q2.y)}`} fill="none" stroke="currentColor" strokeWidth={1.2} />;
  }
  // 작은 쪽 각으로 호를 그린다 (화면 좌표는 y 가 아래라 방향을 외적으로)
  const sweep = u.x * w.y - u.y * w.x > 0 ? 1 : 0;
  return <path d={`M${fmt(p.x)},${fmt(p.y)} A${fmt(r)},${fmt(r)} 0 0 ${sweep} ${fmt(q.x)},${fmt(q.y)}`} fill="none" stroke="currentColor" strokeWidth={1.2} />;
}

// ── 입체도형 겨냥도: 비스듬히 위에서 본 정사영. 보이지 않는 모서리는 점선 ──
type V3 = [number, number, number];
const YAW = (-32 * Math.PI) / 180; // 오른쪽 옆면이 보이게
const ELEV = (24 * Math.PI) / 180; // 윗면이 보이게
function rot([x, y, z]: V3): V3 {
  const x1 = x * Math.cos(YAW) + z * Math.sin(YAW);
  const z1 = -x * Math.sin(YAW) + z * Math.cos(YAW);
  return [x1, y * Math.cos(ELEV) - z1 * Math.sin(ELEV), y * Math.sin(ELEV) + z1 * Math.cos(ELEV)]; // [화면 x, 화면 위쪽, 보는 사람 쪽]
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type Edge2 = { a: XY; b: XY; hidden: boolean };
type Mark = { a: XY; b: XY; label: string; dashed?: boolean; line?: boolean }; // 길이 표시. dashed: 점선 보조선(높이 등), line: 실선 보조선(윗면 반지름)
type Built = { edges: Edge2[]; ellipses: { c: XY; rx: number; ry: number; backDashed: boolean; full?: boolean }[]; marks: Mark[]; names: { at: XY; name: string }[]; dots: XY[]; rights: { o: XY; a: XY; b: XY }[] };

// 다면체: 꼭짓점·면 → 모서리마다 보이는지 (붙은 면 중 하나라도 보는 사람 쪽이면 실선)
function polyhedron(verts: V3[], faces: number[][]) {
  const cen = verts.reduce<V3>((a, v) => [a[0] + v[0] / verts.length, a[1] + v[1] / verts.length, a[2] + v[2] / verts.length], [0, 0, 0]);
  const vis = faces.map((f) => {
    let n = cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]]));
    const fc = f.reduce<V3>((a, i) => [a[0] + verts[i][0] / f.length, a[1] + verts[i][1] / f.length, a[2] + verts[i][2] / f.length], [0, 0, 0]);
    if (dot(n, sub(fc, cen)) < 0) n = [-n[0], -n[1], -n[2]];
    return rot(n)[2] > 1e-9;
  });
  const edges = new Map<string, { i: number; j: number; visible: boolean }>();
  faces.forEach((f, fi) =>
    f.forEach((i, k) => {
      const j = f[(k + 1) % f.length];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      const e = edges.get(key) ?? { i: Math.min(i, j), j: Math.max(i, j), visible: false };
      e.visible ||= vis[fi];
      edges.set(key, e);
    }),
  );
  return [...edges.values()];
}

function buildSolid(f: SolidFigure): Built {
  const out: Built = { edges: [], ellipses: [], marks: [], names: [], dots: [], rights: [] };
  const P = (v: V3): XY => {
    const r = rot(v);
    return { x: r[0], y: -r[1] };
  };
  const L = f.labels ?? {};
  const h = f.height ?? 0;
  const poly = (verts: V3[], faces: number[][]) => {
    for (const e of polyhedron(verts, faces)) out.edges.push({ a: P(verts[e.i]), b: P(verts[e.j]), hidden: !e.visible });
    (f.vertexNames ?? []).slice(0, verts.length).forEach((name, i) => out.names.push({ at: P(verts[i]), name }));
    return verts;
  };
  // 밑면 다각형 (xz 평면, 앞쪽 변이 보는 사람을 향하게)
  const base = (): V3[] => {
    if (f.shape === "cuboid" || (f.width && f.depth && (f.sides ?? 4) === 4)) {
      const w = f.width! / 2;
      const d = f.depth! / 2;
      return [[-w, 0, d], [w, 0, d], [w, 0, -d], [-w, 0, -d]];
    }
    const n = f.sides ?? 4;
    const R = (f.side ?? 4) / (2 * Math.sin(Math.PI / n));
    return Array.from({ length: n }, (_, k) => {
      const t = Math.PI / 2 - Math.PI / n + (2 * Math.PI * k) / n; // 0: 앞 오른쪽, 1: 앞 왼쪽 → 0-1 이 앞 모서리
      return [R * Math.cos(t), 0, R * Math.sin(t)] as V3;
    });
  };

  if (f.shape === "cuboid" || f.shape === "prism") {
    const b = base();
    const n = b.length;
    const verts = poly([...b, ...b.map(([x, , z]) => [x, h, z] as V3)], [
      [...Array(n).keys()],
      [...Array(n).keys()].map((i) => i + n),
      ...[...Array(n).keys()].map((i) => [i, (i + 1) % n, ((i + 1) % n) + n, i + n]),
    ]);
    // 앞 밑변(0→1): 가로·한 변, 오른쪽 밑변(1→2): 세로, 왼쪽 앞 모서리(0→0+n): 높이
    const bottomFront = f.shape === "cuboid" ? L.width : L.side ?? L.width;
    if (bottomFront) out.marks.push({ a: P(verts[0]), b: P(verts[1]), label: bottomFront });
    if (L.depth) out.marks.push({ a: P(verts[1]), b: P(verts[2]), label: L.depth });
    if (L.height) out.marks.push({ a: P(verts[0]), b: P(verts[n]), label: L.height });
  } else if (f.shape === "pyramid") {
    const b = base();
    const n = b.length;
    const verts = poly([...b, [0, h, 0]], [[...Array(n).keys()], ...[...Array(n).keys()].map((i) => [i, (i + 1) % n, n])]);
    if (L.side ?? L.width) out.marks.push({ a: P(verts[0]), b: P(verts[1]), label: (L.side ?? L.width)! });
    if (L.depth) out.marks.push({ a: P(verts[1]), b: P(verts[2]), label: L.depth });
    if (L.slant) out.marks.push({ a: P(verts[1]), b: P(verts[n]), label: L.slant });
    if (L.height) {
      out.marks.push({ a: P([0, 0, 0]), b: P(verts[n]), label: L.height, dashed: true });
      out.rights.push({ o: P([0, 0, 0]), a: P([0, h, 0]), b: P([verts[0][0] / 2 + verts[1][0] / 2, 0, verts[0][2] / 2 + verts[1][2] / 2]) });
      out.dots.push(P([0, 0, 0]));
    }
  } else {
    // 원이 들어간 입체: 밑면은 납작한 타원 (뒤쪽 반은 점선)
    const r = f.radius!;
    const ry = r * Math.sin(ELEV);
    const yb = 0;
    const yt = h * Math.cos(ELEV);
    const c0 = { x: 0, y: -yb };
    const c1 = { x: 0, y: -yt };
    if (f.shape === "sphere") {
      out.ellipses.push({ c: { x: 0, y: 0 }, rx: r, ry: r, backDashed: false, full: true });
      out.ellipses.push({ c: { x: 0, y: 0 }, rx: r, ry, backDashed: true });
      out.dots.push({ x: 0, y: 0 });
      if (L.radius) out.marks.push({ a: { x: 0, y: 0 }, b: { x: r, y: 0 }, label: L.radius, line: true });
    } else if (f.shape === "cylinder") {
      out.ellipses.push({ c: c0, rx: r, ry, backDashed: true });
      out.ellipses.push({ c: c1, rx: r, ry, backDashed: false, full: true });
      out.edges.push({ a: { x: -r, y: c0.y }, b: { x: -r, y: c1.y }, hidden: false }, { a: { x: r, y: c0.y }, b: { x: r, y: c1.y }, hidden: false });
      if (L.radius) {
        out.marks.push({ a: c1, b: { x: r, y: c1.y }, label: L.radius, line: true });
        out.dots.push(c1);
      }
      if (L.height) out.marks.push({ a: { x: -r, y: c0.y }, b: { x: -r, y: c1.y }, label: L.height });
    } else if (f.shape === "cone") {
      out.ellipses.push({ c: c0, rx: r, ry, backDashed: true });
      out.edges.push({ a: { x: -r, y: c0.y }, b: c1, hidden: false }, { a: { x: r, y: c0.y }, b: c1, hidden: false });
      if (L.radius) {
        out.marks.push({ a: c0, b: { x: r, y: c0.y }, label: L.radius, dashed: true });
        out.dots.push(c0);
      }
      if (L.height) {
        out.marks.push({ a: c0, b: c1, label: L.height, dashed: true });
        out.rights.push({ o: c0, a: c1, b: { x: r, y: c0.y } });
      }
      if (L.slant) out.marks.push({ a: { x: r, y: c0.y }, b: c1, label: L.slant });
    } else {
      const rt = f.topRadius!;
      const rty = rt * Math.sin(ELEV);
      out.ellipses.push({ c: c0, rx: r, ry, backDashed: true });
      out.ellipses.push({ c: c1, rx: rt, ry: rty, backDashed: false, full: true });
      out.edges.push({ a: { x: -r, y: c0.y }, b: { x: -rt, y: c1.y }, hidden: false }, { a: { x: r, y: c0.y }, b: { x: rt, y: c1.y }, hidden: false });
      if (L.radius) {
        out.marks.push({ a: c0, b: { x: r, y: c0.y }, label: L.radius, dashed: true });
        out.dots.push(c0);
      }
      if (L.topRadius) {
        out.marks.push({ a: c1, b: { x: rt, y: c1.y }, label: L.topRadius, line: true });
        out.dots.push(c1);
      }
      if (L.height) out.marks.push({ a: c0, b: c1, label: L.height, dashed: true });
      if (L.slant) out.marks.push({ a: { x: r, y: c0.y }, b: { x: rt, y: c1.y }, label: L.slant });
    }
  }
  return out;
}

function Solid({ f }: { f: SolidFigure }) {
  const b = buildSolid(f);
  // 크기 맞추기: 모든 점의 범위
  const xs: number[] = [];
  const ys: number[] = [];
  for (const e of b.edges) {
      xs.push(e.a.x, e.b.x);
      ys.push(e.a.y, e.b.y);
    }
  for (const e of b.ellipses) {
      xs.push(e.c.x - e.rx, e.c.x + e.rx);
      ys.push(e.c.y - e.ry, e.c.y + e.ry);
    }
  for (const m of b.marks) {
      xs.push(m.a.x, m.b.x);
      ys.push(m.a.y, m.b.y);
    }
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = PAD + 14;
  const s = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
  const T = (p: XY): XY => ({ x: pad + (p.x - x0) * s, y: pad + (p.y - y0) * s });
  const vw = (x1 - x0) * s + 2 * pad;
  const vh = (y1 - y0) * s + 2 * pad;
  const center = T({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  const dash = "5 4";
  return (
    <svg viewBox={`0 0 ${fmt(vw)} ${fmt(vh)}`} width={fmt(vw)} className="block h-auto max-w-full" role="img" aria-label="입체도형 그림">
      {b.ellipses.map((e, i) => {
        const c = T(e.c);
        const rx = e.rx * s;
        const ry = e.ry * s;
        if (e.full) return <ellipse key={`e${i}`} cx={fmt(c.x)} cy={fmt(c.y)} rx={fmt(rx)} ry={fmt(ry)} fill="none" stroke="currentColor" strokeWidth={1.6} />;
        // 앞쪽(아래) 반은 실선, 뒤쪽(위) 반은 점선
        return (
          <g key={`e${i}`} fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d={`M${fmt(c.x - rx)},${fmt(c.y)} A${fmt(rx)},${fmt(ry)} 0 0 0 ${fmt(c.x + rx)},${fmt(c.y)}`} />
            <path d={`M${fmt(c.x - rx)},${fmt(c.y)} A${fmt(rx)},${fmt(ry)} 0 0 1 ${fmt(c.x + rx)},${fmt(c.y)}`} strokeDasharray={e.backDashed ? dash : undefined} />
          </g>
        );
      })}
      {b.edges.map((e, i) => {
        const [a, c] = [T(e.a), T(e.b)];
        return <line key={`d${i}`} x1={fmt(a.x)} y1={fmt(a.y)} x2={fmt(c.x)} y2={fmt(c.y)} stroke="currentColor" strokeWidth={1.6} strokeDasharray={e.hidden ? dash : undefined} strokeLinecap="round" />;
      })}
      {b.rights.map((r, i) => {
        const [o, a, c] = [T(r.o), T(r.a), T(r.b)];
        const k = 8;
        const ua = { x: (a.x - o.x) / (Math.hypot(a.x - o.x, a.y - o.y) || 1), y: (a.y - o.y) / (Math.hypot(a.x - o.x, a.y - o.y) || 1) };
        const uc = { x: (c.x - o.x) / (Math.hypot(c.x - o.x, c.y - o.y) || 1), y: (c.y - o.y) / (Math.hypot(c.x - o.x, c.y - o.y) || 1) };
        return (
          <polyline
            key={`r${i}`}
            points={`${fmt(o.x + ua.x * k)},${fmt(o.y + ua.y * k)} ${fmt(o.x + (ua.x + uc.x) * k)},${fmt(o.y + (ua.y + uc.y) * k)} ${fmt(o.x + uc.x * k)},${fmt(o.y + uc.y * k)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          />
        );
      })}
      {b.marks.map((m, i) => {
        const [a, c] = [T(m.a), T(m.b)];
        const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        const nx = -(c.y - a.y);
        const ny = c.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        // 글자 폭만큼 띄운다 (세로 모서리 옆의 '10 cm' 가 선에 닿지 않게)
        const tw = [...m.label].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 13 : 7.5), 0);
        const d = 7 + Math.abs(nx / nl) * (tw / 2) + Math.abs(ny / nl) * 8;
        let off = { x: (nx / nl) * d, y: (ny / nl) * d };
        // 보조선(높이·반지름)은 선 옆에, 모서리는 도형 바깥쪽에
        if (!m.dashed && !m.line && (mid.x + off.x - center.x) ** 2 + (mid.y + off.y - center.y) ** 2 < (mid.x - off.x - center.x) ** 2 + (mid.y - off.y - center.y) ** 2) off = { x: -off.x, y: -off.y };
        return (
          <g key={`m${i}`}>
            {(m.dashed || m.line) && <line x1={fmt(a.x)} y1={fmt(a.y)} x2={fmt(c.x)} y2={fmt(c.y)} stroke="currentColor" strokeWidth={1.2} strokeDasharray={m.dashed ? dash : undefined} />}
            <Label at={{ x: mid.x + off.x, y: mid.y + off.y }}>{m.label}</Label>
          </g>
        );
      })}
      {b.dots.map((d, i) => {
        const p = T(d);
        return <circle key={`o${i}`} cx={fmt(p.x)} cy={fmt(p.y)} r={2.4} fill="currentColor" />;
      })}
      {b.names.map((n, i) => (
        <Label key={`n${i}`} at={away(T(n.at), center, 13)}>
          {n.name}
        </Label>
      ))}
    </svg>
  );
}

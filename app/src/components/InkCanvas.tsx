"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type { InkEvent, Point, Stroke } from "@/lib/types";

// 태블릿 필기 캔버스
// - 도구: 펜 / 연필 / 형광펜 / 지우개(지나간 자리만 지움)
// - 실행취소·다시실행, 색 3개, 굵기 2단계
// - 획마다 좌표·시간, 추가·삭제 이벤트, 화면 이탈을 로그로 남긴다.
// - 애플펜슬: 쓰는 중인 획은 위 캔버스에만 다시 그리고(다 쓴 획은 아래 캔버스에 그대로),
//   펜슬이 보내는 촘촘한 좌표(getCoalescedEvents)를 다 쓰고, 곡선으로 이어서 끊김 없이 그린다.
//   iPad 기본 제스처(스크리블·확대·길게 누르기)가 획을 끊지 않게 터치 기본 동작을 막는다.
// - 지우개: 화면만 가리는 게 아니라 지우개 원과 만나는 경계에서 획 자체를 잘라 나눈다
//   (서버 OCR 은 획 좌표로 다시 그려 읽으므로, 지운 부분이 데이터에도 남지 않아야 한다)

export type InkCanvasHandle = {
  getData: () => { strokes: Stroke[]; events: InkEvent[]; imageDataUrl: string };
  getStrokes: () => Stroke[];
  // 다른 문항으로 넘어갈 때: 그 문항에서 쓰던(또는 제출했던) 획으로 바꾼다. 없으면 빈 칸
  reset: (strokes?: Stroke[]) => void;
};

type Tool = "pen" | "pencil" | "highlighter" | "eraser";

const COLORS = ["#2d2b26", "#87a07a", "#e8a090"];

// 획 id. crypto.randomUUID() 는 https·localhost 에서만 돼서
// 아이패드 등으로 http://192.168.x.x 처럼 접속하면 오류가 난다 → 어디서나 되는 방식으로
let seq = 0;
const strokeId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const W = 1000;
const H = 680;

const TOOL_STYLE: Record<Exclude<Tool, "eraser">, { width: number; alpha: number }> = {
  pen: { width: 3.2, alpha: 1 },
  pencil: { width: 2, alpha: 0.75 },
  highlighter: { width: 18, alpha: 0.3 },
};

// 획을 그리는 경로: 점 사이 가운데를 지나는 곡선으로 이어서 빠르게 써도 각지지 않게
function strokePath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) return ctx.lineTo(pts[0].x + 0.1, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

// 지우개 반지름 (그리기 좌표 기준). 굵게를 고르면 크게
const ERASER_R = { thin: 15, thick: 30 };

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  t: Math.round(a.t + (b.t - a.t) * t),
});

// 획 하나에서 원(c, r) 안쪽을 잘라낸다. 선분이 원과 만나는 점을 계산해 그 자리에서 정확히 끊는다.
// 안 닿으면 null, 닿으면 남은 조각들
function cutStroke(pts: Point[], c: { x: number; y: number }, r: number): Point[][] | null {
  const r2 = r * r;
  const inside = (p: Point) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < r2;
  if (pts.length === 1) return inside(pts[0]) ? [] : null;
  let touched = false;
  const out: Point[][] = [];
  let cur: Point[] = [];
  if (inside(pts[0])) touched = true;
  else cur.push(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const disc = B * B - 4 * A * (fx * fx + fy * fy - r2);
    if (A > 0 && disc > 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
        if (t <= 0 || t >= 1) continue;
        touched = true;
        const p = lerp(a, b, t);
        if (cur.length) {
          cur.push(p); // 밖 → 안: 여기서 조각 끝
          out.push(cur);
          cur = [];
        } else cur = [p]; // 안 → 밖: 여기서 새 조각 시작
      }
    }
    if (inside(b)) touched = true;
    else cur.push(b);
  }
  if (cur.length) out.push(cur);
  return touched ? out : null;
}

// 화면 픽셀 밀도에 맞춰 캔버스 해상도를 올린다 (그리기 좌표는 그대로 W×H)
function sizeCanvas(c: HTMLCanvasElement | null) {
  if (!c) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (c.width !== W * dpr) {
    c.width = W * dpr;
    c.height = H * dpr;
  }
  const ctx = c.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const InkCanvas = forwardRef<
  InkCanvasHandle,
  { footerRight?: ReactNode; initialStrokes?: Stroke[]; onChange?: (strokes: Stroke[]) => void } // onChange: 쓰거나 지우거나 되돌릴 때 (자동 저장용)
>(function InkCanvas({ footerRight, initialStrokes, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null); // 다 쓴 획
  const liveRef = useRef<HTMLCanvasElement>(null); // 지금 쓰는 획 (입력도 이 캔버스가 받는다)
  const frameRef = useRef(0);
  const erasingRef = useRef(false);
  const workRef = useRef<Stroke[] | null>(null); // 지우는 동안 바뀌는 획들 (손을 떼면 저장)
  const erasedRef = useRef(new Set<string>()); // 이번에 지우개가 닿은 원래 획 id (기록용)
  const cursorRef = useRef<Point | null>(null); // 지우개 위치
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes ?? []);
  // 실행취소·다시실행: 바뀌기 전 획 전체를 쌓아 둔다 (지우개가 획을 잘라도 그대로 되돌릴 수 있게)
  const [history, setHistory] = useState<{ prev: Stroke[]; ids: string[] }[]>([]);
  const [future, setFuture] = useState<{ next: Stroke[]; ids: string[] }[]>([]);
  const eventsRef = useRef<InkEvent[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // 손가락·손바닥 터치는 쓰기로 받지 않는다: 태블릿에선 애플펜슬로만 (컴퓨터 마우스는 그대로)
  const ignore = (e: React.PointerEvent) => e.pointerType === "touch";
  const [fingerHint, setFingerHint] = useState(false);
  const hintTimer = useRef(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [thick, setThick] = useState(false);

  const paint = useCallback((ctx: CanvasRenderingContext2D, list: Stroke[]) => {
    for (const s of list) {
      if (s.points.length === 0) continue;
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.strokeStyle = s.tool === "highlighter" ? "#f5d66f" : s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = s.tool === "highlighter" ? "butt" : "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      strokePath(ctx, s.points);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, []);

  const redraw = useCallback(
    (list: Stroke[]) => {
      const ctx = sizeCanvas(canvasRef.current);
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      paint(ctx, list);
    },
    [paint],
  );

  useEffect(() => redraw(strokes), [strokes, redraw]);

  // 쓰는 중인 획(또는 지우는 중인 획들과 지우개 원)만 화면 주사율에 맞춰 다시 그린다
  const drawLive = useCallback(() => {
    frameRef.current = 0;
    if (erasingRef.current && workRef.current) redraw(workRef.current);
    const ctx = sizeCanvas(liveRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (drawingRef.current) paint(ctx, [drawingRef.current]);
    const c = cursorRef.current;
    if (erasingRef.current && c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, thick ? ERASER_R.thick : ERASER_R.thin, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#8c8577";
      ctx.stroke();
    }
  }, [paint, redraw, thick]);

  const scheduleLive = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(drawLive);
  };

  // 펜슬로 쓰는 동안 iPad 기본 동작(스크롤·확대·스크리블·길게 눌러 선택)이 끼어들어 획이 끊기지 않게
  useEffect(() => {
    const c = liveRef.current;
    if (!c) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    const opts = { passive: false } as const;
    c.addEventListener("touchstart", stop, opts);
    c.addEventListener("touchmove", stop, opts);
    c.addEventListener("touchend", stop, opts);
    return () => {
      c.removeEventListener("touchstart", stop);
      c.removeEventListener("touchmove", stop);
      c.removeEventListener("touchend", stop);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const onVis = () => eventsRef.current.push({ type: document.hidden ? "hidden" : "visible", t: Date.now() });
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const toPoint = (e: PointerEvent, rect: DOMRect): Point => ({
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
    t: Math.round(performance.timeOrigin + e.timeStamp),
  });

  // 펜슬은 화면 한 번 그릴 때보다 훨씬 자주 좌표를 보낸다 → 묶여 온 좌표를 모두 쓴다
  const pointsOf = (e: React.PointerEvent): Point[] => {
    const rect = liveRef.current!.getBoundingClientRect();
    const list = e.nativeEvent.getCoalescedEvents?.() ?? [];
    return (list.length ? list : [e.nativeEvent]).map((ev) => toPoint(ev, rect));
  };

  // 바뀐 획들을 저장하고 실행취소 기록에 남긴다
  const commit = (next: Stroke[], ids: string[]) => {
    setHistory((h) => [...h, { prev: strokes, ids }]);
    setFuture([]);
    setStrokes(next);
    onChange?.(next);
  };

  // 지우개가 a → b 로 지나간 자리를 지운다. 사이를 촘촘히 나눠 빠르게 움직여도 빈틈 없이
  const eraseAlong = (a: Point, b: Point) => {
    const r = thick ? ERASER_R.thick : ERASER_R.thin;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r / 3)));
    let list = workRef.current!;
    for (let i = 0; i <= steps; i++) {
      const c = lerp(a, b, i / steps);
      let changed = false;
      const next: Stroke[] = [];
      for (const s of list) {
        const rr = r + s.width / 2; // 획 굵기 가장자리까지
        const near = s.points.some((p) => Math.abs(p.x - c.x) < rr + 40 && Math.abs(p.y - c.y) < rr + 40);
        const pieces = near ? cutStroke(s.points, c, rr) : null;
        if (!pieces) {
          next.push(s);
          continue;
        }
        changed = true;
        erasedRef.current.add(s.id);
        for (const pts of pieces) if (pts.length > 1) next.push({ ...s, id: strokeId(), points: pts });
      }
      if (changed) list = next;
    }
    workRef.current = list;
  };

  const onDown = (e: React.PointerEvent) => {
    if (ignore(e)) {
      // 손가락으로 대면 펜슬로 쓰라고 잠깐 알려 준다
      setFingerHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setFingerHint(false), 1800);
      return;
    }
    if (drawingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e.nativeEvent, liveRef.current!.getBoundingClientRect());
    if (tool === "eraser") {
      erasingRef.current = true;
      workRef.current = strokes;
      erasedRef.current = new Set();
      cursorRef.current = p;
      eraseAlong(p, p);
      return scheduleLive();
    }
    const st = TOOL_STYLE[tool];
    drawingRef.current = {
      id: strokeId(),
      tool,
      color,
      width: st.width * (thick ? 1.8 : 1),
      alpha: st.alpha,
      points: [p],
    };
    scheduleLive();
  };

  // 펜이 닿아 있는지는 buttons 대신 그리는 중인지로 판단 (펜슬 호버 이동은 무시)
  const onMove = (e: React.PointerEvent) => {
    if (ignore(e)) return;
    if (erasingRef.current) {
      for (const p of pointsOf(e)) {
        eraseAlong(cursorRef.current ?? p, p);
        cursorRef.current = p;
      }
      return scheduleLive();
    }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(...pointsOf(e));
    scheduleLive();
  };

  const onUp = (e: React.PointerEvent) => {
    if (ignore(e)) return;
    if (erasingRef.current) {
      erasingRef.current = false;
      cursorRef.current = null;
      // 기록에는 원래 있던 획만 (지우는 중에 잘려 생긴 조각 id 는 빼고)
      const ids = strokes.filter((s) => erasedRef.current.has(s.id)).map((s) => s.id);
      const t = Date.now();
      for (const id of ids) eventsRef.current.push({ type: "erase", strokeId: id, t });
      if (ids.length && workRef.current) commit(workRef.current, ids);
      workRef.current = null;
      drawLive();
      return;
    }
    const s = drawingRef.current;
    drawingRef.current = null;
    if (!s) return;
    // 다 쓴 획은 아래 캔버스로 바로 옮기고 위 캔버스는 비운다 (깜빡임 없게)
    const base = sizeCanvas(canvasRef.current);
    if (base) paint(base, [s]);
    drawLive();
    eventsRef.current.push({ type: "add", strokeId: s.id, t: Date.now() });
    commit([...strokes, s], [s.id]);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    eventsRef.current.push({ type: "undo", strokeId: last.ids[0] ?? "", t: Date.now() });
    setHistory(history.slice(0, -1));
    setFuture((f) => [...f, { next: strokes, ids: last.ids }]);
    setStrokes(last.prev);
    onChange?.(last.prev);
  };

  const redo = () => {
    const nxt = future[future.length - 1];
    if (!nxt) return;
    eventsRef.current.push({ type: "add", strokeId: nxt.ids[0] ?? "", t: Date.now() });
    setFuture(future.slice(0, -1));
    setHistory((h) => [...h, { prev: strokes, ids: nxt.ids }]);
    setStrokes(nxt.next);
    onChange?.(nxt.next);
  };

  useImperativeHandle(ref, () => ({
    getData: () => {
      // OCR용: 흰 배경 위에 필기만 그린 PNG
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const ctx = off.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      paint(ctx, strokes);
      return { strokes, events: eventsRef.current, imageDataUrl: off.toDataURL("image/png") };
    },
    getStrokes: () => strokes,
    reset: (next = []) => {
      eventsRef.current = [];
      setStrokes(next);
      setHistory([]);
      setFuture([]);
    },
  }));

  const toolBtn = (t: Tool, label: string, icon: ReactNode) => (
    <button
      key={t}
      title={label}
      aria-label={label}
      onClick={() => setTool(t)}
      className={`grid h-10 w-10 place-items-center rounded-xl transition ${
        tool === t ? "bg-honey-soft ring-1 ring-honey" : "hover:bg-sand"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-paper">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="text-sm text-muted">나의 풀이</span>
        <div className="flex gap-1 text-muted">
          <IconBtn label="실행취소" onClick={undo} disabled={!history.length}>
            <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
          </IconBtn>
          <IconBtn label="다시실행" onClick={redo} disabled={!future.length}>
            <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
          </IconBtn>
        </div>
      </div>

      {/* 쓰는 칸은 W:H 비율을 지킨 채 남은 자리에 가장 크게 (가로·세로 어느 쪽이든 글씨가 늘어나지 않게) */}
      <div className="mx-3 mt-2 grid min-h-0 flex-1 place-items-center [container-type:size]">
        <div className="dot-grid relative rounded-2xl" style={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))`, aspectRatio: `${W}/${H}` }}>
          <canvas ref={canvasRef} width={W} height={H} className="block h-full w-full" />
          <canvas
            ref={liveRef}
            width={W}
            height={H}
            className="absolute inset-0 block h-full w-full touch-none select-none"
            style={{ cursor: tool === "eraser" ? "cell" : "crosshair", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div
            className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-2 text-sm text-white transition-opacity duration-300 ${
              fingerHint ? "opacity-100" : "opacity-0"
            }`}
          >
            ✏️ 애플펜슬로 써 주세요
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-paper px-2 py-1.5 shadow-sm">
          {toolBtn("pen", "펜", <PenIcon fill="#2d2b26" />)}
          {toolBtn("pencil", "연필", <PenIcon fill="#c9a36a" />)}
          {toolBtn("highlighter", "형광펜", <PenIcon fill="#f5d66f" wide />)}
          {toolBtn("eraser", "지우개", <EraserIcon />)}
          <span className="mx-1 h-6 w-px bg-line" />
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label="색 선택"
              onClick={() => {
                setColor(c);
                if (tool === "eraser" || tool === "highlighter") setTool("pen");
              }}
              className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-paper ${color === c ? "ring-2 ring-honey-deep" : ""}`}
              style={{ background: c }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-line" />
          <button
            aria-label="얇게"
            onClick={() => setThick(false)}
            className={`grid h-9 w-9 place-items-center rounded-xl ${!thick ? "bg-sand" : ""}`}
          >
            <span className="h-0.5 w-4 rounded bg-ink" />
          </button>
          <button
            aria-label="굵게"
            onClick={() => setThick(true)}
            className={`grid h-9 w-9 place-items-center rounded-xl ${thick ? "bg-sand" : ""}`}
          >
            <span className="h-2 w-2 rounded-full bg-ink" />
          </button>
        </div>
        <div className="ml-auto">{footerRight}</div>
      </div>
    </div>
  );
});

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg hover:bg-sand disabled:opacity-30"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function PenIcon({ fill, wide }: { fill: string; wide?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <g transform="rotate(35 12 12)">
        <rect x={wide ? 8.5 : 9.5} y="3" width={wide ? 7 : 5} height="13" rx="1.5" fill={fill} stroke="#2d2b26" strokeWidth="1" />
        <path d={wide ? "M8.5 16h7l-1.5 4h-4z" : "M9.5 16h5L12 21z"} fill="#f1dcc0" stroke="#2d2b26" strokeWidth="1" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <g transform="rotate(35 12 12)">
        <rect x="7" y="5" width="10" height="14" rx="2.5" fill="#f8e1da" stroke="#2d2b26" strokeWidth="1" />
        <rect x="7" y="13" width="10" height="6" rx="2" fill="#e8a090" stroke="#2d2b26" strokeWidth="1" />
      </g>
    </svg>
  );
}

export default InkCanvas;

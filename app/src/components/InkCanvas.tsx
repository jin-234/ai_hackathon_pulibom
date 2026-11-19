"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { InkEvent, Point, Stroke } from "@/lib/types";

// 태블릿 필기 칸 (도구 버튼은 바깥 화면이 갖고, 이 칸은 쓰는 면만)
// - 정리 풀이(lined): 번호 붙은 가로줄 칸. AI 가 이 칸만 위에서부터 읽는다
// - 연습장(dots): 점 격자. 그림·계산을 마음껏 (AI 채점 안 함). 문제 그림을 깔아 둘 수 있다
// - 획마다 좌표·시간, 추가·삭제 이벤트, 화면 이탈을 로그로 남긴다.
// - 애플펜슬: 쓰는 중인 획은 위 캔버스에만 다시 그리고(다 쓴 획은 아래 캔버스에 그대로),
//   펜슬이 보내는 촘촘한 좌표(getCoalescedEvents)를 다 쓰고, 곡선으로 이어서 끊김 없이 그린다.
//   iPad 기본 제스처(스크리블·확대·길게 누르기)가 획을 끊지 않게 펜슬 터치 기본 동작을 막는다.
//   손가락은 막지 않는다: 손가락으로 밀면 칸이 위아래로 움직인다
// - 확대: 두 손가락으로 벌리고 오므리면 칸이 커지고 작아진다 (굿노트처럼, 1~3배). 확대한 채로 펜슬로 쓰고,
//   손가락으로 밀어 옮긴다. 그리기 좌표는 그대로라 확대해도 획 데이터·AI 읽기는 같다
// - 지우개: 화면만 가리는 게 아니라 지우개 원과 만나는 경계에서 획 자체를 잘라 나눈다
//   (서버 OCR 은 획 좌표로 다시 그려 읽으므로, 지운 부분이 데이터에도 남지 않아야 한다)

export type InkCanvasHandle = {
  getData: () => { strokes: Stroke[]; events: InkEvent[]; imageDataUrl: string };
  getStrokes: () => Stroke[];
  // 다른 문항으로 넘어갈 때: 그 문항에서 쓰던(또는 제출했던) 획으로 바꾼다. 없으면 빈 칸
  reset: (strokes?: Stroke[]) => void;
  undo: () => void;
  clear: () => void;
};

export type InkTool = "pen" | "pencil" | "highlighter" | "eraser";
export const INK_COLORS = ["#2d2b26", "#87a07a", "#e8a090"];

// 획 id. crypto.randomUUID() 는 https·localhost 에서만 돼서
// 아이패드 등으로 http://192.168.x.x 처럼 접속하면 오류가 난다 → 어디서나 되는 방식으로
let seq = 0;
const strokeId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const W = 1000; // 그리기 좌표 너비 (칸 너비가 달라도 같은 좌표)
const TOOL_STYLE: Record<Exclude<InkTool, "eraser">, { width: number; alpha: number }> = {
  pen: { width: 3.2, alpha: 1 },
  pencil: { width: 2, alpha: 0.75 },
  highlighter: { width: 18, alpha: 0.3 },
};
// 지우개 반지름 (그리기 좌표 기준). 굵게를 고르면 크게
const ERASER_R = { thin: 15, thick: 30 };

// 칸 높이: 화면에서 약 100px (칸 너비가 달라도 비슷하게). 처음 잴 때 한 번 정하고 바꾸지 않는다 (쓴 글씨와 줄이 어긋나지 않게)
// 처음엔 8칸 이상(보이는 높이보다 조금 더), 아래 두 칸에 쓰면 4칸씩 늘어난다.
// 전체 높이는 아이패드 웹 캔버스 크기 상한(약 1,670만 화소) 안에서 선명하게 그릴 수 있는 만큼까지
const ROW_CSS = 100;
const DEFAULT_ROW_H = 170;
const START_ROWS = 8;
const STEP_ROWS = 4;
const MAX_H = 4000;

// 획이 아래 두 칸까지 내려왔으면 칸을 늘린다 (줄이지는 않는다)
function rowsFor(list: Stroke[], cur: number, rowH: number) {
  const maxY = Math.max(0, ...list.flatMap((s) => s.points.map((p) => p.y)));
  const max = Math.floor(MAX_H / rowH);
  let rows = cur;
  while (rows < max && maxY > (rows - 2) * rowH) rows += STEP_ROWS;
  return Math.min(rows, max);
}

// 문제 글·그림을 연습장에 깔 때 자리 (그리기 좌표)
const BACKDROP = { x: 40, y: 30, w: 900 };

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

// 화면 픽셀 밀도(확대했으면 그만큼 더)에 맞춰 캔버스 해상도를 올린다 (그리기 좌표는 그대로 W×h)
// 칸이 길어지거나 크게 확대해도 캔버스 크기 상한을 넘지 않게 밀도를 낮춘다
const MAX_ZOOM = 3;
function sizeCanvas(c: HTMLCanvasElement | null, h: number, zoom = 1) {
  if (!c) return null;
  const dpr = Math.min((window.devicePixelRatio || 1) * zoom, 3 * zoom, Math.sqrt(16_000_000 / (W * h)));
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const InkCanvas = forwardRef<
  InkCanvasHandle,
  {
    variant?: "lined" | "dots";
    tool?: InkTool;
    color?: string;
    thick?: boolean;
    backdrop?: ReactNode; // 연습장에 깔아 둘 문제 그림 (FigureView)
    initialStrokes?: Stroke[];
    onChange?: (strokes: Stroke[]) => void; // 쓰거나 지우거나 되돌릴 때 (자동 저장용)
    onActive?: () => void; // 펜슬이 닿았을 때 (되돌리기 대상을 이 칸으로)
  }
>(function InkCanvas({ variant = "lined", tool = "pen", color = INK_COLORS[0], thick = false, backdrop, initialStrokes, onChange, onActive }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null); // 다 쓴 획
  const liveRef = useRef<HTMLCanvasElement>(null); // 지금 쓰는 획 (입력도 이 캔버스가 받는다)
  const scrollRef = useRef<HTMLDivElement>(null); // 칸 스크롤 (손가락으로 밀기)
  const frameRef = useRef(0);
  const erasingRef = useRef(false);
  const workRef = useRef<Stroke[] | null>(null); // 지우는 동안 바뀌는 획들 (손을 떼면 저장)
  const erasedRef = useRef(new Set<string>()); // 이번에 지우개가 닿은 원래 획 id (기록용)
  const cursorRef = useRef<Point | null>(null); // 지우개 위치
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes ?? []);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  // 실행취소: 바뀌기 전 획 전체를 쌓아 둔다 (지우개가 획을 잘라도 그대로 되돌릴 수 있게)
  const [history, setHistory] = useState<{ prev: Stroke[]; ids: string[] }[]>([]);
  const eventsRef = useRef<InkEvent[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  // 손가락·손바닥 터치는 쓰기로 받지 않는다: 태블릿에선 애플펜슬로만 (컴퓨터 마우스는 그대로)
  const ignore = (e: React.PointerEvent) => e.pointerType === "touch";
  const [fingerHint, setFingerHint] = useState(false);
  const hintTimer = useRef(0);
  const [atTop, setAtTop] = useState(true);
  // 확대: zoom 은 화면 크기(두 손가락으로 바꾸는 중에도 바로), sharpZoom 은 캔버스 해상도(손을 뗀 뒤 맞춘다)
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const [sharpZoom, setSharpZoom] = useState(1);
  const sharpRef = useRef(1);
  sharpRef.current = sharpZoom;
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  // 칸 수: 쓴 만큼 늘어나고, 보이는 높이보다는 늘 조금 더 길게 (밀어서 아래 칸이 있는 걸 알 수 있게)
  const [rowH, setRowH] = useState(DEFAULT_ROW_H); // 칸 높이 (그리기 좌표)
  const rowHRef = useRef(rowH);
  rowHRef.current = rowH;
  const [baseRows, setBaseRows] = useState(() => rowsFor(initialStrokes ?? [], START_ROWS, DEFAULT_ROW_H));
  const [viewH, setViewH] = useState(0); // 보이는 높이 (그리기 좌표)
  const rows = Math.min(Math.floor(MAX_H / rowH), Math.max(baseRows, Math.ceil(viewH / rowH) + 2));
  const h = rows * rowH; // 칸 전체 높이 (그리기 좌표)
  const hRef = useRef(h);
  hRef.current = h;
  const eraserR = thick ? ERASER_R.thick : ERASER_R.thin;
  const eraserRRef = useRef(eraserR);
  eraserRRef.current = eraserR;
  const backdropRef = useRef<HTMLDivElement>(null);
  // 제출 이미지에 같이 그릴 그림과 자리 (그리기 좌표)
  const backdropImg = useRef<{ img: HTMLImageElement; x: number; y: number; w: number; h: number } | null>(null);

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
      const ctx = sizeCanvas(canvasRef.current, hRef.current, sharpRef.current);
      if (!ctx) return;
      ctx.clearRect(0, 0, W, hRef.current);
      paint(ctx, list);
    },
    [paint],
  );

  // 칸이 늘어나면 캔버스 크기가 바뀌어 지워지므로 다시 그린다
  useEffect(() => redraw(strokes), [strokes, rows, sharpZoom, redraw]);

  // 확대하면서 두 손가락 가운데가 제자리에 있도록 스크롤을 맞춘다 (크기가 바뀐 뒤 바로)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const p = pendingScroll.current;
    if (!el || !p) return;
    pendingScroll.current = null;
    el.scrollLeft = p.left;
    el.scrollTop = p.top;
  }, [zoom]);

  // 보이는 높이 재기 (칸 너비 = 그리기 좌표 W)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let fixed = false;
    const measure = () => {
      if (!el.clientWidth) return;
      setViewH((el.clientHeight / el.clientWidth) * W);
      if (fixed) return;
      fixed = true;
      const r = Math.max(90, Math.min(220, Math.round((ROW_CSS * W) / el.clientWidth)));
      setRowH(r);
      setBaseRows((b) => rowsFor(strokesRef.current, Math.max(b, START_ROWS), r));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 연습장에 깐 문제 그림: 제출 이미지에도 같이 그리려고 이미지로 만들어 둔다 (SVG 는 글자로 옮겨 이미지로)
  useEffect(() => {
    backdropImg.current = null;
    if (!backdrop) return;
    const t = setTimeout(() => {
      const el = backdropRef.current?.querySelector("svg, img");
      const box = backdropRef.current?.parentElement?.getBoundingClientRect(); // 칸 전체 (그리기 좌표 W 에 맞춘다)
      const rect = el?.getBoundingClientRect();
      if (!el || !rect?.width || !box?.width) return;
      const k = W / box.width;
      const at = { x: (rect.left - box.left) * k, y: (rect.top - box.top) * k, w: rect.width * k, h: rect.height * k };
      if (el instanceof HTMLImageElement) backdropImg.current = { img: el, ...at };
      else {
        const img = new Image();
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
        backdropImg.current = { img, ...at };
      }
    }, 300);
    return () => clearTimeout(t);
  }, [backdrop]);

  // 쓰는 중인 획(또는 지우는 중인 획들과 지우개 원)만 화면 주사율에 맞춰 다시 그린다
  const drawLive = useCallback(() => {
    frameRef.current = 0;
    if (erasingRef.current && workRef.current) redraw(workRef.current);
    const ctx = sizeCanvas(liveRef.current, hRef.current, sharpRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, hRef.current);
    if (drawingRef.current) paint(ctx, [drawingRef.current]);
    const c = cursorRef.current;
    if (erasingRef.current && c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, eraserRRef.current, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#8c8577";
      ctx.stroke();
    }
  }, [paint, redraw]);

  const scheduleLive = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(drawLive);
  };

  // 펜슬로 쓰는 동안 iPad 기본 동작(스크롤·확대·스크리블·길게 눌러 선택)이 끼어들어 획이 끊기지 않게
  // 손가락은 막지 않는다: 손가락으로 밀면 칸이 위아래로 움직인다
  useEffect(() => {
    const c = liveRef.current;
    if (!c) return;
    const isStylus = (t: Touch) => (t as Touch & { touchType?: string }).touchType === "stylus";
    // 두 손가락 확대: 처음 벌린 거리·배율·가운데 점을 기억해 두고, 움직일 때마다 배율과 스크롤을 맞춘다
    let pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
    const fingers = (e: TouchEvent) => Array.from(e.touches).filter((t) => !isStylus(t));
    const mid = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) });
    const onTouch = (e: TouchEvent) => {
      if (Array.from(e.changedTouches).some(isStylus)) e.preventDefault();
      const f = fingers(e);
      const el = scrollRef.current;
      if (!el) return;
      if (f.length >= 2) {
        e.preventDefault(); // 화면 전체 확대·스크롤 대신 이 칸만 확대
        const m = mid(f[0], f[1]);
        const box = el.getBoundingClientRect();
        if (!pinch) {
          // 가운데 점이 칸 안에서 가리키는 자리 (확대 전 크기 기준)
          const z0 = zoomRef.current;
          pinch = { d0: m.d || 1, z0, cx: (el.scrollLeft + m.x - box.left) / z0, cy: (el.scrollTop + m.y - box.top) / z0 };
          return;
        }
        const z = Math.min(MAX_ZOOM, Math.max(1, (pinch.z0 * m.d) / pinch.d0));
        pendingScroll.current = { left: pinch.cx * z - (m.x - box.left), top: pinch.cy * z - (m.y - box.top) };
        if (z !== zoomRef.current) setZoom(z);
        else {
          el.scrollLeft = pendingScroll.current.left;
          el.scrollTop = pendingScroll.current.top;
          pendingScroll.current = null;
        }
      } else if (pinch && e.type !== "touchmove") {
        pinch = null;
        // 손을 떼면 그 배율에 맞춰 캔버스를 선명하게 다시 그린다 (거의 원래 크기면 딱 맞춘다)
        if (zoomRef.current < 1.05) setZoom(1);
        setSharpZoom(zoomRef.current < 1.05 ? 1 : zoomRef.current);
      }
    };
    const opts = { passive: false } as const;
    const box = c.closest("[data-ink-zoom]") ?? c;
    box.addEventListener("touchstart", onTouch as EventListener, opts);
    box.addEventListener("touchmove", onTouch as EventListener, opts);
    box.addEventListener("touchend", onTouch as EventListener, opts);
    box.addEventListener("touchcancel", onTouch as EventListener, opts);
    return () => {
      box.removeEventListener("touchstart", onTouch as EventListener);
      box.removeEventListener("touchmove", onTouch as EventListener);
      box.removeEventListener("touchend", onTouch as EventListener);
      box.removeEventListener("touchcancel", onTouch as EventListener);
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
    y: ((e.clientY - rect.top) / rect.height) * hRef.current,
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
    setHistory((hs) => [...hs, { prev: strokes, ids }]);
    setStrokes(next);
    setBaseRows((r) => rowsFor(next, r, rowHRef.current));
    onChange?.(next);
  };

  // 지우개가 a → b 로 지나간 자리를 지운다. 사이를 촘촘히 나눠 빠르게 움직여도 빈틈 없이
  const eraseAlong = (a: Point, b: Point) => {
    const r = eraserR;
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

  // 손가락 톡 대기 판별: 움직이지 않았고 한 손가락이었을 때만 펜슬 안내 (확대·밀기 뒤에는 안 띄운다)
  const tapRef = useRef<{ x: number; y: number; multi: boolean; n: number }>({ x: 0, y: 0, multi: false, n: 0 });
  const onDown = (e: React.PointerEvent) => {
    if (ignore(e)) {
      const t = tapRef.current;
      t.n += 1;
      if (t.n === 1) Object.assign(t, { x: e.clientX, y: e.clientY, multi: false });
      else t.multi = true;
      return; // 손가락: 밀면 칸이 움직이고, 톡 대면(onUp) 펜슬로 쓰라고 알려 준다
    }
    if (drawingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onActive?.();
    const p = toPoint(e.nativeEvent, liveRef.current!.getBoundingClientRect());
    if (tool === "eraser") {
      erasingRef.current = true;
      workRef.current = strokes;
      erasedRef.current = new Set();
      cursorRef.current = p;
      eraseAlong(p, p);
      scheduleLive();
      return;
    }
    const st = TOOL_STYLE[tool];
    drawingRef.current = { id: strokeId(), tool, color, width: st.width * (thick ? 1.8 : 1), alpha: st.alpha, points: [p] };
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
    if (ignore(e)) {
      // 밀지 않고 톡 대기만 했으면 펜슬로 쓰라고 잠깐 알려 준다 (밀면 pointercancel 로 온다)
      const t = tapRef.current;
      t.n = Math.max(0, t.n - 1);
      const tap = !t.multi && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10;
      if (e.type === "pointerup" && tap) {
        setFingerHint(true);
        clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setFingerHint(false), 1800);
      }
      return;
    }
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
    const base = sizeCanvas(canvasRef.current, hRef.current, sharpRef.current);
    if (base) paint(base, [s]);
    drawLive();
    eventsRef.current.push({ type: "add", strokeId: s.id, t: Date.now() });
    commit([...strokes, s], [s.id]);
  };

  useImperativeHandle(ref, () => ({
    getData: () => {
      // 흰 배경 위에 필기만 그린 PNG (연습장은 깔아 둔 문제 그림도). 아래 칸까지 안 썼으면 쓴 곳까지만 (최소 한 화면)
      const maxY = Math.max(0, ...strokes.flatMap((s) => s.points.map((p) => p.y)));
      const bd = backdropImg.current;
      const img = bd?.img.complete && bd.img.naturalWidth ? bd : null;
      const outH = Math.min(h, Math.max(680, Math.ceil(maxY + 60), img ? Math.ceil(img.y + img.h + 30) : 0));
      const off = document.createElement("canvas");
      off.width = W;
      off.height = outH;
      const ctx = off.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, outH);
      if (img) ctx.drawImage(img.img, img.x, img.y, img.w, img.h);
      paint(ctx, strokes);
      return { strokes, events: eventsRef.current, imageDataUrl: off.toDataURL("image/png") };
    },
    getStrokes: () => strokes,
    reset: (next = []) => {
      eventsRef.current = [];
      scrollRef.current?.scrollTo({ top: 0, left: 0 });
      setZoom(1);
      setSharpZoom(1);
      setBaseRows(rowsFor(next, START_ROWS, rowHRef.current));
      setStrokes(next);
      setHistory([]);
    },
    undo: () => {
      const last = history[history.length - 1];
      if (!last) return;
      eventsRef.current.push({ type: "undo", strokeId: last.ids[0] ?? "", t: Date.now() });
      setHistory(history.slice(0, -1));
      setStrokes(last.prev);
      onChange?.(last.prev);
    },
    clear: () => {
      if (!strokes.length) return;
      eventsRef.current.push({ type: "clear", t: Date.now() });
      commit([], strokes.map((s) => s.id));
    },
  }));

  const lined = variant === "lined";
  return (
    <div
      data-ink-zoom
      className={`relative h-full w-full overflow-hidden rounded-[1.75rem] border border-line ${lined ? "bg-[#fffdf8]" : "bg-[#f6f1e4]"}`}
    >
      <div
        ref={scrollRef}
        onScroll={(e) => setAtTop(e.currentTarget.scrollTop < 24)}
        className={`h-full w-full overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${zoom > 1 ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"}`}
      >
        {/* 확대하면 칸 너비가 배율만큼 커진다 (높이는 비율대로). 그리기 좌표는 그대로 */}
        <div
          className="relative"
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: `${W}/${h}`,
            ...(lined ? {} : { backgroundImage: "radial-gradient(circle, #ddd3bd 1px, transparent 1.2px)", backgroundSize: "22px 22px" }),
          }}
        >
          {/* 정리 풀이: 왼쪽 번호 칸 + 가로줄 (화면 표시만, 획 데이터에는 들어가지 않는다) */}
          {lined && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-y-0 left-[4.6%] border-l border-[#efe3c8]" />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="absolute inset-x-0" style={{ top: `${(i * 100) / rows}%`, height: `${100 / rows}%` }}>
                  <span className="absolute left-0 top-2 w-[4.6%] text-center text-[11px] font-semibold text-[#c9bfa8]">{i + 1}</span>
                  <div className="absolute bottom-0 left-[4.6%] right-[1.5%] border-b-[1.5px] border-[#e8dfcc]" />
                </div>
              ))}
            </div>
          )}
          {/* 연습장에 깔아 둔 문제 그림 (그 위에 펜슬로 그린다) */}
          {!lined && backdrop && (
            <div
              ref={backdropRef}
              className="pointer-events-none absolute select-none [&_img]:!max-h-[min(26rem,45dvh)] [&_svg]:h-[min(26rem,45dvh)] [&_svg]:w-auto [&_svg]:max-w-full"
              style={{ left: `${(BACKDROP.x / W) * 100}%`, top: `${(BACKDROP.y / h) * 100}%`, width: `${(BACKDROP.w / W) * 100}%` }}
            >
              {backdrop}
            </div>
          )}
          <canvas ref={canvasRef} width={W} height={h} className="relative block h-full w-full" />
          <canvas
            ref={liveRef}
            width={W}
            height={h}
            className="absolute inset-0 block h-full w-full select-none"
            style={{ cursor: tool === "eraser" ? "cell" : "crosshair", touchAction: zoom > 1 ? "pan-x pan-y" : "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
      </div>
      <div
        className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-2 text-sm text-white transition-opacity duration-300 ${
          fingerHint ? "opacity-100" : "opacity-0"
        }`}
      >
        ✏️ 애플펜슬로 써 주세요
      </div>
      {/* 확대 중: 배율 표시, 누르면 원래 크기로 */}
      {zoom > 1 && (
        <button
          onClick={() => {
            setZoom(1);
            setSharpZoom(1);
          }}
          className="absolute right-3 top-3 rounded-full border border-line bg-paper/95 px-3 py-1 text-xs font-semibold text-ink shadow-sm"
        >
          {Math.round(zoom * 100)}% · 원래 크기
        </button>
      )}
      {/* 아래 칸이 더 있다는 표시 (맨 위에 있을 때만) */}
      <div
        className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-paper/90 px-3 py-1 text-xs text-muted shadow-sm transition-opacity duration-300 ${
          atTop && zoom === 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        ↓ 손가락으로 밀면 아래 칸이 더 있어요
      </div>
    </div>
  );
});

// 도구 알약: 펜·연필·형광펜·지우개 · 색 3개 · 굵기 2단계 (연습장·정리 풀이가 같이 쓴다)
export function InkToolPill({
  tool,
  setTool,
  color,
  setColor,
  thick,
  setThick,
}: {
  tool: InkTool;
  setTool: (t: InkTool) => void;
  color: string;
  setColor: (c: string) => void;
  thick: boolean;
  setThick: (b: boolean) => void;
}) {
  // 애플펜슬 더블탭(아이패드 앱이 보내 줌): 지우개 ↔ 직전 도구
  const lastDrawTool = useRef<InkTool>(tool === "eraser" ? "pen" : tool);
  if (tool !== "eraser") lastDrawTool.current = tool;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => {
    const onTap = () => setTool(toolRef.current === "eraser" ? lastDrawTool.current : "eraser");
    window.addEventListener("pulibom:pencil-tap", onTap);
    return () => window.removeEventListener("pulibom:pencil-tap", onTap);
  }, [setTool]);

  const toolBtn =(t: InkTool, label: string, icon: ReactNode) => (
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
    <div className="flex h-[54px] shrink-0 flex-wrap items-center gap-1 rounded-2xl border border-line bg-paper px-2 shadow-sm">
      {toolBtn("pen", "펜", <PenIcon fill="#2d2b26" />)}
      {toolBtn("pencil", "연필", <PenIcon fill="#c9a36a" />)}
      {toolBtn("highlighter", "형광펜", <PenIcon fill="#f5d66f" wide />)}
      {toolBtn("eraser", "지우개", <EraserIcon />)}
      <span className="mx-1 h-6 w-px bg-line" />
      {INK_COLORS.map((c) => (
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

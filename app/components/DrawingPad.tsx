"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState } from "react";

type Pt = { x: number; y: number };
type Stroke = { tool: "pen" | "eraser"; color: string; width: number; points: Pt[] };
export type PadEvent = { t: number; type: "stroke" | "erase" | "undo" | "redo" | "clear" | "hidden" | "visible" };
export type PadHandle = {
  exportPng: () => Promise<Blob>;
  getEvents: () => PadEvent[];
  isEmpty: () => boolean;
};

const COLORS = ["#1f2937", "#2563eb", "#dc2626"];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (!s.points.length) return;
  ctx.save();
  ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (const p of s.points) ctx.lineTo(p.x, p.y);
  if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.01, s.points[0].y);
  ctx.stroke();
  ctx.restore();
}

const DrawingPad = forwardRef<PadHandle, { startedAt: number }>(function DrawingPad({ startedAt }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const events = useRef<PadEvent[]>([]);
  const penSeen = useRef(false);
  const size = useRef({ w: 0, h: 0 });
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const log = useCallback((type: PadEvent["type"]) => events.current.push({ t: Date.now() - startedAt, type }), [startedAt]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.current.w, size.current.h);
    for (const s of strokes.current) drawStroke(ctx, s);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: wrap.clientWidth, h: wrap.clientHeight };
      c.width = size.current.w * dpr;
      c.height = size.current.h * dpr;
      c.style.width = `${size.current.w}px`;
      c.style.height = `${size.current.h}px`;
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    const onVis = () => log(document.hidden ? "hidden" : "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [log]);

  const toPt = (e: React.PointerEvent | PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") penSeen.current = true;
    if (penSeen.current && e.pointerType === "touch") return; // 펜을 쓰면 손바닥 터치 무시
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { tool, color, width: tool === "eraser" ? 26 : 3, points: [toPt(e)] };
    redoStack.current = [];
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!s || !ctx) return;
    const native = e.nativeEvent;
    const pts = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents().map(toPt) : [toPt(e)];
    const prev = s.points[s.points.length - 1];
    s.points.push(...pts);
    drawStroke(ctx, { ...s, points: [prev, ...pts] });
  };

  const onUp = () => {
    const s = current.current;
    if (!s) return;
    strokes.current.push(s);
    current.current = null;
    log(s.tool === "eraser" ? "erase" : "stroke");
    rerender();
  };

  const undo = () => {
    const s = strokes.current.pop();
    if (!s) return;
    redoStack.current.push(s);
    log("undo");
    redraw();
    rerender();
  };
  const redo = () => {
    const s = redoStack.current.pop();
    if (!s) return;
    strokes.current.push(s);
    log("redo");
    redraw();
    rerender();
  };
  const clear = () => {
    if (!strokes.current.length) return;
    strokes.current = [];
    redoStack.current = [];
    log("clear");
    redraw();
    rerender();
  };

  useImperativeHandle(ref, () => ({
    getEvents: () => events.current,
    isEmpty: () => !strokes.current.some((s) => s.tool === "pen"),
    exportPng: () =>
      new Promise<Blob>((resolve, reject) => {
        const { w, h } = size.current;
        const scale = 1.5;
        // 지우개(destination-out)가 흰 배경까지 지우지 않도록 투명 레이어에 그린 뒤 흰 배경에 합성
        const layer = document.createElement("canvas");
        layer.width = w * scale;
        layer.height = h * scale;
        const lctx = layer.getContext("2d")!;
        lctx.scale(scale, scale);
        for (const s of strokes.current) drawStroke(lctx, s);
        const out = document.createElement("canvas");
        out.width = layer.width;
        out.height = layer.height;
        const octx = out.getContext("2d")!;
        octx.fillStyle = "#fff";
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(layer, 0, 0);
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/png");
      }),
  }));

  const toolBtn = (active: boolean) =>
    `grid h-10 w-10 place-items-center rounded-xl text-lg ${active ? "bg-sun" : "hover:bg-paper"}`;

  return (
    <div className="flex h-full flex-col">
      <div ref={wrapRef} className="grid-paper relative min-h-0 flex-1 overflow-hidden rounded-t-2xl">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-b-2xl border-t border-line bg-card px-3 py-2">
        <button type="button" className={toolBtn(tool === "pen")} onClick={() => setTool("pen")} title="펜">
          ✏️
        </button>
        <button type="button" className={toolBtn(tool === "eraser")} onClick={() => setTool("eraser")} title="지우개">
          🧽
        </button>
        <span className="mx-2 h-6 w-px bg-line" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setTool("pen");
            }}
            className={`h-7 w-7 rounded-full border-2 ${color === c && tool === "pen" ? "border-ink" : "border-transparent"}`}
            style={{ background: c }}
            aria-label="색상"
          />
        ))}
        <span className="mx-2 h-6 w-px bg-line" />
        <button type="button" className={toolBtn(false)} onClick={undo} disabled={!strokes.current.length} title="되돌리기">
          ↶
        </button>
        <button type="button" className={toolBtn(false)} onClick={redo} disabled={!redoStack.current.length} title="다시 하기">
          ↷
        </button>
        <button type="button" className="btn-ghost ml-auto" onClick={clear}>
          전체 지우기
        </button>
      </div>
    </div>
  );
});

export default DrawingPad;

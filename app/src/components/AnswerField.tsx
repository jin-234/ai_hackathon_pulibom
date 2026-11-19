"use client";

import { useEffect, useRef, useState } from "react";
import type { Point, Stroke } from "@/lib/types";

// 답안 칸: 제출 버튼 바로 왼쪽에서 최종 답을 따로 받는다
// - 애플펜슬로 쓰면 칸 위 투명 캔버스에 필기가 보이고, 마지막 획 뒤 0.9초 멈추면 서버에서 읽어 글자로 바꾼다
// - 손가락은 손을 뗄 때, 마우스는 누를 때 입력칸에 포커스 → 키보드로 직접 입력·수정
//   (iOS 는 터치가 끝날 때 포커스해야 키보드가 뜬다)
// - 획 좌표는 칸의 화면 px 그대로 보낸다

const PEN = "#2D2B26";
const PEN_WIDTH = 2.4;
const IDLE_MS = 900;
const FAIL = "글씨를 못 읽었어요. 다시 쓰거나 터치해서 입력해 주세요.";

let seq = 0;
const strokeId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function AnswerField({
  problemId,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  problemId: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const timerRef = useRef(0);
  const bubbleTimer = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [focused, setFocused] = useState(false);
  const [reading, setReading] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [inking, setInking] = useState(false); // 칸 위에 아직 글자로 안 바뀐 필기가 있음 (글자를 흐리게)

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = PEN;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const s of all) {
      const pts = s.points;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++)
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const clearInk = () => {
    strokesRef.current = [];
    drawingRef.current = null;
    setInking(false);
    redraw();
  };

  // 캔버스 해상도를 칸 크기·화면 밀도에 맞춘다
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    // 펜슬로 쓰는 동안 스크리블·확대·길게 누르기가 획을 끊지 않게 (손가락 터치는 그대로 둔다: 손을 떼면 키보드)
    const block = (e: TouchEvent) => {
      if (Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus")) e.preventDefault();
    };
    c.addEventListener("touchstart", block, { passive: false });
    c.addEventListener("touchmove", block, { passive: false });
    return () => {
      ro.disconnect();
      c.removeEventListener("touchstart", block);
      c.removeEventListener("touchmove", block);
    };
  }, []);

  // 다른 문항으로 넘어가면 쓰던 필기·말풍선은 버린다
  useEffect(() => {
    clearTimeout(timerRef.current);
    clearInk();
    setBubble(null);
    setReading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(bubbleTimer.current);
  }, []);

  const showBubble = (text: string) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 3000);
  };

  const recognize = async () => {
    const sent = strokesRef.current;
    if (!sent.length) return;
    const forProblem = problemId;
    setReading(true);
    let text = "";
    let error = FAIL;
    try {
      const res = await fetch("/api/answer-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId, strokes: sent }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (res.ok) text = data.text?.trim() ?? "";
      else if (data.error) error = data.error;
    } catch {}
    // 읽는 동안 새로 쓴 획이 있으면 이 결과는 버린다 (곧 그 획까지 다시 읽는다)
    if (forProblem !== problemId || strokesRef.current !== sent) return;
    setReading(false);
    clearInk();
    if (text) onChange((valueRef.current + text).slice(0, 100));
    else showBubble(error);
  };

  const point = (e: { clientX: number; clientY: number; timeStamp: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: Math.round(performance.timeOrigin + e.timeStamp) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (e.pointerType === "mouse") {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (e.pointerType !== "pen") return; // 손가락은 손을 뗄 때
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTimeout(timerRef.current);
    setBubble(null);
    setInking(true);
    drawingRef.current = { id: strokeId(), tool: "pen", color: PEN, width: PEN_WIDTH, points: [point(e)] };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = drawingRef.current;
    if (!s) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) s.points.push(point(ev));
    redraw();
  };

  const onPointerUp = () => {
    const s = drawingRef.current;
    if (!s) return;
    drawingRef.current = null;
    strokesRef.current = [...strokesRef.current, s];
    redraw();
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(recognize, IDLE_MS);
  };

  return (
    // 답안 칸: honey 테두리 알약, 앞에 굵은 "답". 포커스 땐 honeyDeep 테두리 + honey 링
    <div
      className={`relative flex h-[54px] min-w-0 flex-1 items-center rounded-full border bg-paper transition ${
        focused ? "border-honey-deep ring-[3px] ring-honey/40" : "border-honey"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span className="shrink-0 pl-5 pr-3 font-extrabold text-ink">답</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        maxLength={100}
        enterKeyHint="send"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="펜슬 또는 터치로 입력 · x = 3"
        aria-label="답안 칸"
        className={`h-full min-w-0 flex-1 bg-transparent pr-2 font-[family-name:var(--font-math)] text-lg text-ink outline-none transition-opacity placeholder:font-sans placeholder:text-sm placeholder:text-muted ${
          inking ? "opacity-30" : ""
        }`}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchEnd={(e) => {
          // 손가락: 터치가 끝날 때 포커스해야 iOS 키보드가 뜬다
          const finger = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType !== "stylus");
          if (finger && !disabled) inputRef.current?.focus();
        }}
        className={`absolute inset-0 h-full w-full touch-none rounded-full ${focused ? "pointer-events-none" : ""}`}
      />
      {/* 오른쪽: 읽는 중이면 노란 원 스피너, 값이 있으면 ✕ 지우기 (캔버스 위에 올려 누를 수 있게) */}
      <span className="relative z-10 flex w-11 shrink-0 justify-center pr-1">
        {reading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-honey border-t-transparent" aria-label="읽는 중" />
        ) : value && !disabled ? (
          <button
            type="button"
            aria-label="답 지우기"
            onClick={() => onChange("")}
            className="grid h-7 w-7 place-items-center text-muted"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        ) : null}
      </span>
      {bubble && (
        <div className="pointer-events-none absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-ink/85 px-3 py-2 text-xs text-white shadow-md">
          {bubble}
        </div>
      )}
    </div>
  );
}

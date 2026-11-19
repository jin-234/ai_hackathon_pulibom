"use client";

import { useEffect, useRef, useState } from "react";
import { formatDue } from "@/lib/types";

// 날짜·시간 선택: 날짜는 달력, 시간은 휠 피커 (iOS 스타일).
// 브라우저 기본 달력(datetime-local)은 브라우저마다 모양이 제각각이라 직접 그린다.
// 값은 datetime-local 과 같은 "YYYY-MM-DDTHH:mm" 문자열로 주고받는다 (빈 문자열 = 미설정).

const ITEM_H = 40;
const VISIBLE = 3; // 홀수: 가운데 줄이 선택
const WEEK = "일월화수목금토";

const pad = (n: number) => String(n).padStart(2, "0");
const toValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

const AMPM = ["오전", "오후"];
const HOURS = ["12", ...Array.from({ length: 11 }, (_, i) => String(i + 1))]; // 인덱스 = 시 % 12
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function Wheel({ items, index, onPick, className = "" }: { items: string[]; index: number; onPick: (i: number) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(false);
  // 스크롤 핸들러가 최신 값을 보도록
  const latest = useRef({ index, onPick });
  latest.current = { index, onPick };

  // 바깥에서 값이 바뀌면 그 칸으로 굴린다 (처음엔 바로 이동)
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ITEM_H) !== index)
      el.scrollTo({ top: index * ITEM_H, behavior: mounted.current ? "smooth" : "auto" });
    mounted.current = true;
  }, [index]);

  // 스크롤이 멈추면 가운데 칸을 선택
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      if (i !== latest.current.index) latest.current.onPick(i);
    }, 120);
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={`wheel relative z-10 snap-y snap-mandatory overflow-y-auto ${className}`}
      style={{ height: ITEM_H * VISIBLE, paddingBlock: ITEM_H * Math.floor(VISIBLE / 2) }}
    >
      {items.map((t, i) => (
        <div
          key={i}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
          className={`flex cursor-pointer snap-center items-center justify-center transition-colors ${
            i === index ? "font-semibold text-ink" : "text-muted"
          }`}
          style={{ height: ITEM_H }}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

// 한 달 달력. minDay~maxDay 밖의 날짜는 고를 수 없다.
function Calendar({ selected, onPick, minDay, maxDay }: { selected: Date; onPick: (d: Date) => void; minDay?: Date; maxDay?: Date }) {
  const today = startOfDay(new Date());
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  // 바깥에서 다른 달로 바뀌면(빠른 버튼 등) 그 달을 보여준다
  useEffect(() => setView(new Date(selected.getFullYear(), selected.getMonth(), 1)), [selected.getFullYear(), selected.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  const canPrev = !minDay || view > new Date(minDay.getFullYear(), minDay.getMonth(), 1);
  const move = (m: number) => setView(new Date(view.getFullYear(), view.getMonth() + m, 1));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" onClick={() => move(-1)} disabled={!canPrev} className="rounded-full px-2.5 py-1 text-muted hover:bg-sand disabled:opacity-30" aria-label="이전 달">
          ‹
        </button>
        <span className="font-semibold">
          {view.getFullYear()}년 {view.getMonth() + 1}월
        </span>
        <button type="button" onClick={() => move(1)} className="rounded-full px-2.5 py-1 text-muted hover:bg-sand" aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted">
        {[...WEEK].map((w, i) => (
          <span key={w} className={`py-1 ${i === 0 ? "text-red-400" : ""}`}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              disabled={(minDay && d < minDay) || (maxDay && d > maxDay)}
              onClick={() => onPick(d)}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:text-line ${
                sameDay(d, selected)
                  ? "bg-honey font-semibold text-ink"
                  : sameDay(d, today)
                    ? "border border-honey-deep hover:bg-honey-soft"
                    : "hover:bg-honey-soft"
              }`}
            >
              {d.getDate()}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
  min,
  placeholder = "날짜·시간 선택",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const cur = value ? new Date(value) : null;
  const d = cur ?? new Date();

  // 날짜·시간 중 한 부분만 바꾼다. 지난 시각은 고를 수 없다 (min 으로 맞춘다)
  const set = (day: Date, hours: number, minutes: number) => {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
    onChange(min && next.getTime() < new Date(min).getTime() ? min : toValue(next));
  };
  const h = d.getHours();
  const m = d.getMinutes();

  const openPicker = () => {
    // 비어 있으면 내일 이 시각(10분 단위 올림)으로 시작
    if (!value) onChange(toValue(new Date(Math.ceil((Date.now() + 86400000) / 600000) * 600000)));
    setOpen((o) => !o);
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={openPicker} className={`input w-auto text-left ${cur ? "" : "text-muted"} ${className}`}>
        {cur ? formatDue(cur.getTime()) : placeholder}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-[#fffdf8]/[0.97] p-3 shadow-lg">
          <Calendar selected={d} onPick={(day) => set(day, h, m)} minDay={startOfDay(new Date())} />
          <div className="relative mt-3 flex border-t border-line pt-3 text-[15px]">
            {/* 선택 줄 표시 */}
            <div
              className="pointer-events-none absolute inset-x-0 rounded-xl bg-honey-soft"
              style={{ top: `calc(0.75rem + ${ITEM_H * Math.floor(VISIBLE / 2)}px)`, height: ITEM_H }}
            />
            <Wheel items={AMPM} index={h < 12 ? 0 : 1} onPick={(i) => set(d, i * 12 + (h % 12), m)} className="flex-1" />
            <Wheel items={HOURS} index={h % 12} onPick={(i) => set(d, (h < 12 ? 0 : 12) + i, m)} className="flex-1" />
            <Wheel items={MINUTES} index={m} onPick={(i) => set(d, h, i)} className="flex-1" />
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-honey px-4 py-1.5 text-sm text-ink">
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 날짜만 고르기 (지난 날짜도 가능). 값은 type="date" 와 같은 "YYYY-MM-DD" (빈 문자열 = 미설정)
const toDay = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);
const dayValue = (d: Date) => toValue(d).slice(0, 10);

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "날짜 선택",
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const cur = toDay(value);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        className={`rounded-full border border-line bg-paper px-3 py-1 text-left ${cur ? "" : "text-muted"} ${className}`}
      >
        {cur ? cur.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }) : placeholder}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-[#fffdf8]/[0.97] p-3 shadow-lg">
          <Calendar
            selected={cur ?? new Date()}
            minDay={toDay(min ?? "")}
            maxDay={toDay(max ?? "")}
            onPick={(d) => {
              onChange(dayValue(d));
              setOpen(false);
            }}
          />
          {value && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs text-muted underline"
              >
                지우기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

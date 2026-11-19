"use client";

import { useEffect, useRef, useState } from "react";
import { CHOICE_MARKS, choiceMarks } from "@/lib/problemFormat";

// 답안 칸: 제출 버튼 바로 왼쪽에서 최종 답을 따로 받는다
// - 애플펜슬로 칸에 바로 쓰면 iPad 손글씨 입력(Scribble)이 그 자리에서 글자로 바꿔 넣는다 (메모 앱처럼, 기기 안에서 바로)
// - 손가락으로 누르면 키보드로 입력·수정
// - π·√·² 처럼 손글씨로 잘 안 들어가는 기호는 옆 단추로 넣는다. 'ㅠ'·'pi' 로 들어온 건 π 로 바꾼다

// 손글씨·키보드로 들어온 기호를 수식 기호로 (한글 조합 중이 아닐 때만)
export function normalizeAnswer(v: string) {
  return v
    .replace(/[ㅠΠ]/g, "π") // 손글씨 π 는 'ㅠ' 로 읽히기 쉽다
    .replace(/(^|[^a-z])pi(?![a-z])/gi, "$1π")
    .replace(/루트\s*/g, "√");
}

const SYMBOLS = ["π", "√", "²"];

export default function AnswerField({
  problemId,
  value,
  onChange,
  onSubmit,
  disabled,
  flushRef,
}: {
  problemId: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  // 제출할 때 부른다: 지금 칸의 최종 답을 돌려준다
  flushRef?: { current: (() => Promise<string>) | null };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [focused, setFocused] = useState(false);

  // 제출 직전: 기호를 정리한 최종 답
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      const v = normalizeAnswer(valueRef.current);
      if (v !== valueRef.current) onChange(v);
      return v;
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, onChange]);

  // 다른 문항으로 넘어가면 키보드를 내린다
  useEffect(() => {
    inputRef.current?.blur();
  }, [problemId]);

  // 기호 단추: 커서 자리에 넣고 커서를 그 뒤로
  const insert = (sym: string) => {
    const el = inputRef.current;
    const cur = valueRef.current;
    const at = el && document.activeElement === el ? (el.selectionStart ?? cur.length) : cur.length;
    const end = el && document.activeElement === el ? (el.selectionEnd ?? at) : at;
    const next = (cur.slice(0, at) + sym + cur.slice(end)).slice(0, 100);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el || document.activeElement !== el) return;
      el.setSelectionRange(at + sym.length, at + sym.length);
    });
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
        onChange={(e) => {
          const composing = (e.nativeEvent as InputEvent).isComposing;
          onChange(composing ? e.target.value : normalizeAnswer(e.target.value));
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          const v = normalizeAnswer(e.currentTarget.value);
          if (v !== e.currentTarget.value) onChange(v);
        }}
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
        placeholder="펜슬로 쓰거나 눌러서 입력 · x = 3"
        aria-label="답안 칸"
        className="h-full min-w-0 flex-1 bg-transparent pr-2 font-[family-name:var(--font-math)] text-lg text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted"
      />
      {/* 기호 단추 (누르는 동안 키보드가 내려가지 않게 mousedown 기본 동작을 막는다) */}
      {!disabled && (
        <span className="flex shrink-0 items-center gap-1">
          {SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              aria-label={`${sym} 넣기`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insert(sym)}
              className="grid h-9 w-9 place-items-center rounded-full bg-sand font-[family-name:var(--font-math)] text-base text-ink"
            >
              {sym}
            </button>
          ))}
        </span>
      )}
      {/* 값이 있으면 ✕ 지우기 */}
      <span className="flex w-11 shrink-0 justify-center pr-1">
        {value && !disabled ? (
          <button type="button" aria-label="답 지우기" onClick={() => onChange("")} className="grid h-7 w-7 place-items-center text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        ) : null}
      </span>
    </div>
  );
}

// 객관식 답안 칸: 보기 번호(①②③…)를 나열해서 고른다.
//  정답 하나: 값은 고른 보기 전체 ("③ (x - 2)(x + 2)") / 정답 여러 개(multiple): 고른 번호들 ("②, ④")
export function ChoiceField({
  choices,
  value,
  onChange,
  disabled,
  multiple,
}: {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  multiple?: boolean;
}) {
  const picked = multiple ? choiceMarks(value) : [value.trim().charAt(0)];
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={multiple ? "답 모두 고르기" : "답 고르기"}
      className={`flex h-[54px] min-w-0 flex-1 items-center gap-1.5 rounded-full border border-honey bg-paper pr-2 ${disabled ? "opacity-50" : ""}`}
    >
      <span className="flex shrink-0 flex-col items-center pl-5 pr-2 leading-tight">
        <span className="font-extrabold text-ink">답</span>
        {multiple && <span className="text-[10px] font-semibold text-olive">모두</span>}
      </span>
      {choices.map((c) => {
        const mark = c.charAt(0);
        const on = picked.includes(mark);
        const toggle = () => {
          if (!multiple) return onChange(on ? "" : c);
          const next = on ? picked.filter((m) => m !== mark) : [...picked, mark];
          onChange(CHOICE_MARKS.filter((m) => next.includes(m)).join(", "));
        };
        return (
          <button
            key={mark}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            aria-label={c}
            title={c}
            disabled={disabled}
            onClick={toggle}
            className={`grid h-10 min-w-10 flex-1 place-items-center rounded-full text-xl transition ${
              on ? "bg-honey font-bold text-ink ring-2 ring-honey-deep" : "text-ink hover:bg-sand"
            }`}
          >
            {mark}
          </button>
        );
      })}
    </div>
  );
}

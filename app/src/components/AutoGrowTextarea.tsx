"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// 내용(줄바꿈뿐 아니라 자동 줄넘김까지)에 맞춰 높이가 위아래로 늘어나는 textarea.
// 값이 바뀔 때와 칸 너비가 바뀔 때(창 크기 조절 등) 다시 잰다.
export function AutoGrowTextarea({ value, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // border-box 라면 테두리 두께만큼 더해 줘야 스크롤바가 생기지 않는다
    const cs = getComputedStyle(el);
    const border = cs.boxSizing === "border-box" ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) : 0;
    el.style.height = `${el.scrollHeight + border}px`;
  };

  useLayoutEffect(fit, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <textarea ref={ref} value={value} rows={1} className={`overflow-hidden ${className ?? ""}`} {...props} />;
}

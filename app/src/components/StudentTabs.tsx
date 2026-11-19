"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 학생 과제 목록 탭 (아이패드 앱 하단 탭 바와 연결)
// 세 탭 내용을 미리 다 받아 두고 화면에서만 바꿔서, 서버를 다시 부르지 않고 바로 부드럽게 넘어간다.
// 앱은 window 이벤트 'pulibom:tab' 으로 탭을 바꾸고, 주소(?tab=)도 같이 바꿔서 정렬·새로고침 때 그대로 남는다.
export const TAB_ORDER = ["todo", "done", "past"] as const;
export type StudentTab = (typeof TAB_ORDER)[number];

export default function StudentTabs({ initial, panels }: { initial: StudentTab; panels: Record<StudentTab, ReactNode> }) {
  const [active, setActive] = useState(initial);
  const [dir, setDir] = useState<"left" | "right" | null>(null);
  const activeRef = useRef(initial);

  useEffect(() => {
    const go = (next: StudentTab) => {
      if (next === activeRef.current) return;
      setDir(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(activeRef.current) ? "right" : "left");
      activeRef.current = next;
      setActive(next);
      const url = new URL(location.href);
      url.searchParams.set("tab", next);
      history.replaceState(history.state, "", url);
      window.scrollTo({ top: 0 });
    };
    const onTab = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (TAB_ORDER.includes(t as StudentTab)) go(t as StudentTab);
    };
    window.addEventListener("pulibom:tab", onTab);
    const w = window as unknown as { __pulibomTabs?: boolean; __pulibomReady?: boolean };
    w.__pulibomTabs = true;
    w.__pulibomReady = true; // 앱이 Next 라우터로 화면을 옮겨도 되는 때
    return () => {
      window.removeEventListener("pulibom:tab", onTab);
      w.__pulibomTabs = false;
    };
  }, []);

  return (
    <div key={active} className={dir ? `tab-in-${dir}` : undefined}>
      {panels[active]}
    </div>
  );
}

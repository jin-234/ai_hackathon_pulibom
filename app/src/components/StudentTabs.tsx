"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// 학생 과제 목록 탭 (아이패드 앱 하단 탭 바와 연결)
// 세 탭 내용을 미리 다 받아 두고 화면에서만 바꿔서, 서버를 다시 부르지 않고 바로 부드럽게 넘어간다.
// 앱은 window 이벤트 'pulibom:tab' 으로 탭을 바꾸고, 주소(?tab=)도 같이 바꿔서 정렬·새로고침 때 그대로 남는다.
// 세 탭을 옆으로 나란히 붙여 두고 같이 움직인다: 손가락으로 옆으로 밀면 옆 탭이 바로 붙어서 따라 들어온다
// (왼쪽 → 다음 탭). 앱 하단 탭 바는 주소(?tab=)를 보고 따라온다.
export const TAB_ORDER = ["todo", "done", "past"] as const;
export type StudentTab = (typeof TAB_ORDER)[number];

const SLIDE = "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)";

export default function StudentTabs({ initial, panels }: { initial: StudentTab; panels: Record<StudentTab, ReactNode> }) {
  const [active, setActive] = useState(initial);
  const activeRef = useRef(initial);
  const index = TAB_ORDER.indexOf(active);
  const [drag, setDrag] = useState(0); // 손가락으로 민 거리 (px)
  const [anim, setAnim] = useState(false);
  const swipedRef = useRef(false); // 밀고 난 직후 카드가 눌린 걸로 처리되지 않게
  // 높이는 지금 탭에 맞춘다 (긴 탭 때문에 짧은 탭 아래가 비지 않게)
  const panelRefs = useRef<Partial<Record<StudentTab, HTMLDivElement | null>>>({});
  const [height, setHeight] = useState<number | null>(null);
  // 옆 여백: 넘기는 판을 화면 끝까지 넓혀서(내용 자리는 그대로) 카드 그림자·유리 배경이 중간에서 잘려 보이지 않게
  const rootRef = useRef<HTMLDivElement>(null);
  const [gutter, setGutter] = useState({ l: 0, r: 0 });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setGutter({ l: Math.round(r.left), r: Math.round(document.documentElement.clientWidth - r.right) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const go = (next: StudentTab) => {
    setAnim(true);
    setDrag(0);
    if (next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
    const url = new URL(location.href);
    url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    const el = panelRefs.current[active];
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  // 옆으로 밀기: 화면 어디서든 (빈 곳 포함). 미는 동안 손가락을 따라 움직이고, 충분히 밀고 놓으면 옆 탭으로
  useEffect(() => {
    let st: { id: number; x: number; y: number; locked: boolean } | null = null;
    const neighbor = (dx: number) => TAB_ORDER[TAB_ORDER.indexOf(activeRef.current) + (dx < 0 ? 1 : -1)] ?? null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || st) return;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: false };
      swipedRef.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!st || st.id !== e.pointerId) return;
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (!st.locked) {
        if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) return void (st = null); // 위아래 스크롤
        if (Math.abs(dx) < 12) return;
        st.locked = true;
        swipedRef.current = true;
      }
      setAnim(false);
      setDrag(neighbor(dx) ? dx : dx * 0.25); // 넘길 탭이 없으면 살짝만
    };
    const onUp = (e: PointerEvent) => {
      if (!st || st.id !== e.pointerId) return;
      const { x, locked } = st;
      st = null;
      if (!locked) return;
      const dx = e.clientX - x;
      const next = neighbor(dx);
      // 충분히 밀었으면 옆 탭으로, 아니면 제자리로 (둘 다 지금 위치에서 이어서 미끄러진다)
      goRef.current(e.type === "pointerup" && Math.abs(dx) >= 70 && next ? next : activeRef.current);
    };
    // 옆으로 미는 동작은 브라우저가 가져가지 않게 (위아래 스크롤·확대는 그대로)
    const root = document.documentElement;
    const prev = root.style.touchAction;
    root.style.touchAction = "pan-y pinch-zoom";
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      root.style.touchAction = prev;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const onTab = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (TAB_ORDER.includes(t as StudentTab)) goRef.current(t as StudentTab);
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
    <div ref={rootRef}>
    {/* 화면 끝에서 끝까지: 옆 탭은 화면 밖에서만 잘리고, 위아래(그림자)는 자르지 않는다. 높이는 지금 탭만큼 */}
    <div style={{ overflowX: "clip", height: height ?? undefined, marginLeft: -gutter.l, marginRight: -gutter.r }}>
      <div
        onClickCapture={(e) => {
          if (swipedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            swipedRef.current = false;
          }
        }}
        className="flex items-start"
        style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))`, transition: anim ? SLIDE : "none" }}
      >
        {TAB_ORDER.map((t) => (
          <div
            key={t}
            ref={(el) => {
              panelRefs.current[t] = el;
            }}
            aria-hidden={t !== active}
            className="w-full shrink-0"
            style={{ paddingLeft: gutter.l, paddingRight: gutter.r }}
          >
            {panels[t]}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = { studentId: string; name: string; unread: number; lastBody: string; lastAt: number; lastFromTeacher: boolean };

// 선생님 상단 메시지 알림: 학생이 보낸 안 읽은 메시지 수 + 누르면 학생별 대화 목록 (읽은 대화도 최근 순으로, 20초마다 확인)
export default function TeacherInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/messages/inbox").catch(() => null);
      if (alive && res?.ok) setItems(((await res.json()) as { inbox: Item[] }).inbox);
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const total = items.reduce((n, i) => n + i.unread, 0);

  return (
    <div ref={box} className="relative">
      <button
        aria-label={`학생 메시지${total ? ` ${total}개 안 읽음` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-sand"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#e0614a] px-1 text-[10px] font-bold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="solid absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-2xl border border-line shadow-lg">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">학생 메시지</div>
          {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">아직 주고받은 메시지가 없어요.</p>}
          <div className="max-h-96 overflow-y-auto">
          {items.map((i) => (
            <Link
              key={i.studentId}
              href={`/teacher/students/${i.studentId}?tab=messages`}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-sand/60"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-honey-soft text-sm font-semibold">{i.name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {i.name}
                  {i.unread > 0 && <span className="rounded-full bg-[#e0614a] px-1.5 text-[10px] text-white">{i.unread}</span>}
                  <span className="ml-auto text-[10px] font-normal text-muted">
                    {new Date(i.lastAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className={`block truncate text-xs ${i.unread > 0 ? "font-semibold text-ink" : "text-muted"}`}>
                  {i.lastFromTeacher && "나: "}
                  {i.lastBody}
                </span>
              </span>
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

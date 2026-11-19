"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = { studentId: string; name: string; unread: number; lastBody: string; lastAt: number; lastFromTeacher: boolean };
type Pick = { id: string; name: string; number: number | null; className: string };

// 선생님 상단 메시지 알림: 학생이 보낸 안 읽은 메시지 수 + 누르면 학생별 대화 목록 (읽은 대화도 최근 순으로, 20초마다 확인)
//  '새 메시지': 아직 대화가 없는 학생에게도 선생님이 먼저 보낸다 (지금 담당 반 학생을 골라 대화 창으로)
export default function TeacherInbox() {
  const [items, setItems] = useState<Item[]>([]);
  const [students, setStudents] = useState<Pick[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/messages/inbox").catch(() => null);
      if (!alive || !res?.ok) return;
      const d = (await res.json()) as { inbox: Item[]; students?: Pick[] };
      setItems(d.inbox);
      setStudents(d.students ?? []);
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
        onClick={() => {
          setOpen((o) => !o);
          setPicking(false);
          setQ("");
        }}
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
          <div className="flex items-center border-b border-line px-4 py-2.5 text-sm font-semibold">
            {picking ? "누구에게 보낼까요?" : "학생 메시지"}
            <button
              onClick={() => {
                setPicking((p) => !p);
                setQ("");
              }}
              className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${picking ? "border border-line text-muted hover:bg-sand" : "bg-honey text-ink hover:bg-honey-deep"}`}
            >
              {picking ? "← 대화 목록" : "✎ 새 메시지"}
            </button>
          </div>
          {picking ? (
            <StudentPicker students={students} q={q} setQ={setQ} onPick={() => setOpen(false)} />
          ) : (
          <>
          {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">아직 주고받은 메시지가 없어요. ‘✎ 새 메시지’로 먼저 보낼 수 있어요.</p>}
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
          </>
          )}
        </div>
      )}
    </div>
  );
}

// 새 메시지: 지금 담당 반 학생을 반별로 (이름·번호로 찾기) → 그 학생 대화 창
function StudentPicker({ students, q, setQ, onPick }: { students: Pick[]; q: string; setQ: (v: string) => void; onPick: () => void }) {
  const t = q.trim();
  const shown = t ? students.filter((s) => s.name.includes(t) || String(s.number ?? "") === t.replace(/번$/, "")) : students;
  const classes = [...new Set(shown.map((s) => s.className))];
  return (
    <div className="flex flex-col">
      <div className="border-b border-line/60 p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 번호로 찾기" className="input w-full text-sm" />
      </div>
      <div className="max-h-96 overflow-y-auto">
        {students.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">지금 담당하는 반에 학생이 없어요.</p>}
        {students.length > 0 && shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">‘{t}’ 학생이 없어요.</p>}
        {classes.map((c) => (
          <div key={c}>
            <div className="bg-sand/60 px-4 py-1 text-[11px] font-semibold text-muted">{c}</div>
            {shown
              .filter((s) => s.className === c)
              .map((s) => (
                <Link
                  key={`${c}-${s.id}`}
                  href={`/teacher/students/${s.id}?tab=messages`}
                  onClick={onPick}
                  className="flex items-center gap-3 border-b border-line/60 px-4 py-2 text-sm last:border-0 hover:bg-sand/60"
                >
                  <span className="w-8 shrink-0 text-xs tabular-nums text-muted">{s.number ?? "-"}번</span>
                  <span className="font-semibold">{s.name}</span>
                </Link>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

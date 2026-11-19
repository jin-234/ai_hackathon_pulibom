"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/messages";

// 선생님 화면: 학생과 주고받는 메시지 (학생 상세 '메시지' 탭). 열려 있는 동안 5초마다 새 메시지를 가져온다
export default function MessageThread({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch(`/api/students/${studentId}/messages`).catch(() => null);
      if (!alive || !res?.ok) return;
      const d = (await res.json()) as { messages: Message[]; canSend: boolean };
      setMessages((prev) => (prev.length === d.messages.length && prev.at(-1)?.id === d.messages.at(-1)?.id ? prev : d.messages));
      setCanSend(d.canSend);
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [studentId]);

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/students/${studentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessages((m) => [...m, d.message]);
      setText("");
    } catch (e) {
      setError((e as Error).message || "보내지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-5">
      <h2 className="font-semibold">
        {studentName} 학생과 메시지 <span className="text-xs font-normal text-muted">학생 아이패드 앱 상단의 💬 와 이어져요</span>
      </h2>
      <div ref={listRef} className="flex max-h-[420px] min-h-[200px] flex-col gap-2 overflow-y-auto rounded-2xl bg-sand/40 p-3">
        {messages.length === 0 && <p className="m-auto text-sm text-muted">아직 주고받은 메시지가 없어요.</p>}
        {messages.map((m) => {
          const mine = m.sender === "teacher";
          return (
            <div key={m.id} className={`flex max-w-[75%] flex-col gap-0.5 ${mine ? "items-end self-end" : "items-start self-start"}`}>
              {!mine && <span className="px-1 text-[11px] text-muted">{m.senderName}</span>}
              <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-honey" : "rounded-bl-md border border-line bg-paper"}`}>
                {m.body}
              </div>
              <span className="px-1 text-[10px] text-muted">
                {new Date(m.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {mine && (m.readAt ? " · 읽음" : "")}
              </span>
            </div>
          );
        })}
      </div>
      {canSend ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="학생에게 보낼 말" className="input flex-1" />
          <button disabled={sending || !text.trim()} className="rounded-full bg-honey px-5 font-semibold disabled:opacity-50">
            {sending ? "보내는 중…" : "보내기"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted">지난 학년 학생이라 읽기만 할 수 있어요.</p>
      )}
      {error && <p className="text-sm text-[#b5624f]">{error}</p>}
    </section>
  );
}

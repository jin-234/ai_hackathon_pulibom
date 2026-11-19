"use client";

import { useEffect, useRef, useState } from "react";
import type { Attachment, Message } from "@/lib/messages";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 서버와 같게 (Vercel 요청 크기 한도 안)
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// 선생님 화면: 학생과 주고받는 메시지 (학생 상세 '메시지' 탭). 열려 있는 동안 5초마다 새 메시지를 가져온다
//  - 아직 대화가 없어도 선생님이 먼저 보낼 수 있다 (상단 💬 의 '새 메시지'로도 연다)
//  - 학습 자료: 📎 파일(4MB 이하), 본문에 붙여 넣은 유튜브·웹 주소는 링크 카드로 (학생 아이패드 앱에서 바로 열림)
export default function MessageThread({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const pickFile = (f: File | undefined) => {
    setError("");
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError(`파일은 4MB 까지 보낼 수 있어요 (고른 파일 ${sizeLabel(f.size)}). 큰 영상은 유튜브·드라이브 링크로 보내 주세요.`);
      return;
    }
    setFile(f);
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError("");
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("body", body);
        form.append("file", file);
        res = await fetch(`/api/students/${studentId}/messages`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/students/${studentId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      }
      const d = await res.json().catch(() => ({ error: res.status === 413 ? "파일이 너무 커요 (4MB 이하)." : "보내지 못했어요." }));
      if (!res.ok) throw new Error(d.error);
      setMessages((m) => [...m, d.message]);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
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
        {messages.length === 0 && (
          <p className="m-auto text-center text-sm text-muted">
            아직 주고받은 메시지가 없어요.
            {canSend && <><br />먼저 보내 보세요. 개념 영상 링크나 학습 자료 파일도 보낼 수 있어요.</>}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender === "teacher";
          return (
            <div key={m.id} className={`flex max-w-[75%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}>
              {!mine && <span className="px-1 text-[11px] text-muted">{m.senderName}</span>}
              <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-honey" : "rounded-bl-md border border-line bg-paper"}`}>
                {m.body}
              </div>
              {(m.attachments ?? []).map((a, i) => (
                <AttachmentCard key={i} a={a} />
              ))}
              <span className="px-1 text-[10px] text-muted">
                {new Date(m.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {mine && (m.readAt ? " · 읽음" : "")}
              </span>
            </div>
          );
        })}
      </div>
      {canSend ? (
        <div className="flex flex-col gap-2">
          {file && (
            <div className="flex w-fit items-center gap-2 rounded-full border border-line bg-sand/60 px-3 py-1 text-xs">
              📎 {file.name} <span className="text-muted">{sizeLabel(file.size)}</span>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                aria-label="첨부 빼기"
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="파일 보내기 (PDF·한글·워드·PPT·그림 등, 4MB 이하)"
              aria-label="파일 보내기"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line hover:bg-sand"
            >
              📎
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="학생에게 보낼 말 · 유튜브·자료 주소를 붙여 넣으면 링크로 보내져요"
              className="input flex-1"
            />
            <button disabled={sending || (!text.trim() && !file)} className="rounded-full bg-honey px-5 font-semibold disabled:opacity-50">
              {sending ? "보내는 중…" : "보내기"}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-xs text-muted">지난 학년 학생이라 읽기만 할 수 있어요.</p>
      )}
      {error && <p className="text-sm text-[#b5624f]">{error}</p>}
    </section>
  );
}

// 첨부 카드: 유튜브는 썸네일, 그 밖의 링크는 주소, 파일은 이름·크기 (누르면 새 탭)
function AttachmentCard({ a }: { a: Attachment }) {
  if (a.kind === "link" && a.youtubeId)
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block w-64 overflow-hidden rounded-xl border border-line bg-paper hover:brightness-95">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${a.youtubeId}/mqdefault.jpg`} alt="" className="aspect-video w-full object-cover" />
        <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold">
          <span className="text-[#e0614a]">▶</span> 유튜브 영상 보기
        </span>
      </a>
    );
  if (a.kind === "link")
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="flex max-w-64 items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs hover:bg-sand">
        🔗 <span className="truncate underline-offset-2 hover:underline">{a.url.replace(/^https?:\/\//, "")}</span>
      </a>
    );
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="flex max-w-64 items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs hover:bg-sand">
      📄 <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
      <span className="shrink-0 text-muted">{sizeLabel(a.size)}</span>
    </a>
  );
}

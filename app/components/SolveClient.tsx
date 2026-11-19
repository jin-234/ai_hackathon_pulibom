"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import DrawingPad, { type PadHandle } from "./DrawingPad";

type Problem = { id: string; content: string };

export default function SolveClient({
  studentId,
  assignmentId,
  title,
  problems,
  submittedIds,
}: {
  studentId: string;
  assignmentId: string;
  title: string;
  problems: Problem[];
  submittedIds: string[];
}) {
  const [done, setDone] = useState(() => new Set(submittedIds));
  const firstOpen = problems.findIndex((p) => !submittedIds.includes(p.id));
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pad = useRef<PadHandle>(null);

  const allDone = useMemo(() => problems.every((p) => done.has(p.id)), [problems, done]);
  const problem = problems[idx];

  const goTo = (i: number) => {
    setIdx(i);
    setAnswer("");
    setMsg(null);
    setStartedAt(Date.now());
  };

  const submit = async () => {
    if (!pad.current || !problem) return;
    if (pad.current.isEmpty()) return setMsg("풀이 과정을 써 주세요.");
    if (!answer.trim()) return setMsg("최종 답을 입력해 주세요.");
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("image", await pad.current.exportPng(), "solution.png");
      fd.append("studentId", studentId);
      fd.append("assignmentId", assignmentId);
      fd.append("problemId", problem.id);
      fd.append("finalAnswer", answer);
      fd.append("startedAt", String(startedAt));
      fd.append("events", JSON.stringify(pad.current.getEvents()));
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "제출 실패");

      const next = new Set(done).add(problem.id);
      setDone(next);
      const after = problems.findIndex((p, i) => i > idx && !next.has(p.id));
      const any = after !== -1 ? after : problems.findIndex((p) => !next.has(p.id));
      if (any !== -1) goTo(any);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (allDone) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="text-6xl">🐥</div>
        <h1 className="mt-4 text-2xl font-bold">모두 제출했어요!</h1>
        <p className="mt-2 text-ink-soft">천천히 풀어도 괜찮아요. 선생님이 풀이를 살펴볼게요.</p>
        <Link href={`/student/${studentId}`} className="btn-primary mt-8">
          과제 목록으로
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-6xl flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <Link href={`/student/${studentId}`} className="text-sm text-ink-soft hover:text-ink">
          ← 목록
        </Link>
        <h1 className="font-semibold">{title}</h1>
        <div className="ml-auto flex gap-1.5">
          {problems.map((p, i) => (
            <button
              key={p.id}
              type="button"
              disabled={done.has(p.id)}
              onClick={() => goTo(i)}
              className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
                done.has(p.id) ? "bg-leaf text-white" : i === idx ? "bg-sun" : "bg-card border border-line"
              }`}
            >
              {done.has(p.id) ? "✓" : i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[300px_1fr]">
        <section className="card flex flex-col p-5">
          <div className="text-xs font-bold tracking-wider text-sun-deep">QUESTION {String(idx + 1).padStart(2, "0")}</div>
          <p className="mt-2 text-sm text-ink-soft">다음 일차방정식을 풀고, 풀이 과정을 써 보세요.</p>
          <div className="mt-4 rounded-xl bg-paper px-4 py-6 text-center font-serif text-2xl">{problem.content}</div>

          <label className="mt-auto pt-6 text-sm font-semibold">최종 답</label>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-serif text-xl">x =</span>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              inputMode="text"
              placeholder="예: 4, -3/2"
              className="w-full rounded-xl border border-line px-3 py-2 text-lg outline-none focus:border-sun-deep"
            />
          </div>
          {msg && <p className="mt-2 text-sm text-alert">{msg}</p>}
          <button type="button" className="btn-primary mt-3 py-3 text-base" onClick={submit} disabled={busy}>
            {busy ? "제출 중…" : "풀이 제출하기 →"}
          </button>
        </section>

        <section className="card min-h-[360px]">
          <DrawingPad key={problem.id} ref={pad} startedAt={startedAt} />
        </section>
      </div>
    </main>
  );
}

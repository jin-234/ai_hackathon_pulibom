"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemedialButton({ studentId, concept }: { studentId: string; concept: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/remedial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, concept }),
        });
        if (!res.ok) {
          alert((await res.json()).error ?? "배정 실패");
          setState("idle");
          return;
        }
        setState("done");
        router.refresh();
      }}
    >
      {state === "done" ? "배정됨 ✓" : state === "busy" ? "배정 중…" : "보충 과제 배정"}
    </button>
  );
}

export function NoteForm({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, body }),
        });
        setBusy(false);
        if (res.ok) {
          setBody("");
          router.refresh();
        }
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="예: 이항할 때 부호 바꾸는 걸 말로 설명하게 했더니 스스로 고침"
        className="rounded-xl border border-line p-3 text-sm outline-none focus:border-sun-deep"
      />
      <button className="btn-primary self-end" disabled={busy}>
        메모 저장
      </button>
    </form>
  );
}

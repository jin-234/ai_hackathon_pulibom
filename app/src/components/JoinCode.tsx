"use client";

import { useEffect, useState } from "react";

// 오늘의 교실 반 이름 아래: 학생 회원가입용 반 코드 (복사 · 가입 주소 복사 · 새로 만들기). 보관된 반은 가입을 받지 않아 안 보임
export default function JoinCode({ classId, archived }: { classId: string; archived: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(null);
    setNote("");
    if (archived) return;
    let alive = true;
    fetch(`/api/classes/${classId}/join-code`)
      .then((r) => r.json())
      .then((d) => alive && (d.error ? setNote(d.error) : setCode(d.code)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [classId, archived]);

  if (archived || (!code && !note)) return null;

  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(""), 2000);
  };
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(done);
    } catch {
      flash("복사하지 못했어요. 직접 적어 주세요.");
    }
  };
  const regenerate = async () => {
    if (!confirm("새 반 코드를 만들까요? 이전 코드로는 더 이상 가입할 수 없어요. (이미 가입한 학생은 그대로)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/join-code`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setCode(d.code);
      flash("새 코드를 만들었어요.");
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      {code && (
        <>
          <span>반 코드</span>
          <button
            onClick={() => copy(code, "코드를 복사했어요.")}
            title="눌러서 복사"
            className="rounded-full border border-line bg-paper px-2.5 py-0.5 font-mono text-sm font-semibold tracking-[0.2em] text-ink hover:bg-sand"
          >
            {code}
          </button>
          <button onClick={() => copy(`${location.origin}/signup?code=${code}`, "가입 주소를 복사했어요.")} className="rounded-full px-2 py-0.5 hover:bg-sand">
            가입 주소 복사
          </button>
          <button onClick={regenerate} disabled={busy} className="rounded-full px-2 py-0.5 hover:bg-sand disabled:opacity-40">
            ↻ 새 코드
          </button>
        </>
      )}
      {note && <span className="text-olive">{note}</span>}
    </div>
  );
}

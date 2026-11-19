"use client";

import { useEffect, useState } from "react";
import { useTeacherClass } from "@/components/useTeacherClass";
import { MASTERY_MAX, MASTERY_MIN, type ClassSettings } from "@/lib/classSettings";

type Loaded = { settings: ClassSettings; defaults: ClassSettings };

// 교사 설정 (반마다): 반복 학습 기준
export default function SettingsPage() {
  const { classes, selected: cls, select, loading } = useTeacherClass({ currentOnly: true });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mastery, setMastery] = useState(4);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (!cls) return;
    setLoaded(null);
    setMsg(null);
    fetch(`/api/classes/${cls.id}/settings`)
      .then((r) => r.json())
      .then((d: Loaded & { error?: string }) => {
        if (d.error) return setMsg({ ok: false, text: d.error });
        setLoaded(d);
        setMastery(d.settings.mastery);
        setSaved(d.settings.mastery);
      })
      .catch(() => setMsg({ ok: false, text: "설정을 불러오지 못했어요." }));
  }, [cls]);

  const dirty = loaded && mastery !== saved;

  const save = async () => {
    if (!cls) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/classes/${cls.id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mastery }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSaved(d.settings.mastery);
      setMsg({ ok: true, text: `${cls.label} 설정을 저장했어요.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">설정</h1>
          <p className="mt-1 text-sm text-muted">반마다 따로 정해요. 바꾸지 않으면 기본값을 써요.</p>
        </div>
        <select value={cls?.id ?? ""} onChange={(e) => select(e.target.value)} disabled={!classes.length} className="input ml-auto w-auto" aria-label="반 선택">
          {!classes.length && <option value="">{loading ? "반 불러오는 중…" : "올해 담당 반이 없어요"}</option>}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {msg && <p className={`rounded-2xl px-4 py-3 text-sm ${msg.ok ? "bg-sage-soft text-[#5d7a50]" : "bg-salmon-soft text-[#b5624f]"}`}>{msg.text}</p>}

      {loaded && (
        <>
          <section className="flex flex-col gap-3 rounded-3xl border border-line bg-paper p-6">
            <h2 className="font-bold">반복 학습 기준</h2>
            <p className="text-sm text-muted">
              오류를 <b className="text-ink">극복했다</b>, 문제 틀을 <b className="text-ink">익혔다</b>고 보려면 몇 번 연속으로 맞혀야 할지 정해요. 그렇게 본 것은 다음 보충 문제에서
              덜 내요. 낮추면 빨리 다음 단계로 넘어가고, 높이면 더 확실할 때만 넘어가요.
            </p>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">연속</span>
              <select value={mastery} onChange={(e) => setMastery(Number(e.target.value))} className="input w-auto" aria-label="연속 정답 수">
                {Array.from({ length: MASTERY_MAX - MASTERY_MIN + 1 }, (_, i) => MASTERY_MIN + i).map((n) => (
                  <option key={n} value={n}>
                    {n}번{n === loaded.defaults.mastery ? " (기본)" : ""}
                  </option>
                ))}
              </select>
              <span className="text-muted">맞히면 극복·익힘으로 봐요</span>
            </label>
          </section>

          <div className="sticky bottom-4 flex items-center justify-end gap-3">
            {dirty && <span className="rounded-full bg-paper/90 px-3 py-1 text-xs text-muted">저장하지 않은 변경이 있어요</span>}
            <button
              onClick={save}
              disabled={busy || !dirty || cls?.archived}
              className="rounded-full bg-honey px-6 py-3 font-semibold shadow-sm transition hover:bg-honey-deep disabled:opacity-40"
            >
              {busy ? "저장하는 중…" : "설정 저장"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

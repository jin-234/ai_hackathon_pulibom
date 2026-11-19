"use client";

import { useCallback, useEffect, useState } from "react";
import { SubmissionCard } from "@/components/StudentDetail";
import { useLiveRefresh } from "@/components/useLiveRefresh";
import type { Submission } from "@/lib/types";

type Item = Submission & { studentName: string };

const REASON: Partial<Record<Submission["status"], { label: string; cls: string }>> = {
  needs_review: { label: "판독 어려움", cls: "bg-honey text-ink" },
  error: { label: "AI 분석 실패", cls: "bg-sand text-ink" },
};

const isDone = (s: Submission) => Boolean(s.teacher?.confirmedAt);
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 오늘의 교실 '확인할 풀이' 탭: 반 전체에서 교사가 확인할 풀이 (AI가 판독하기 어려웠거나 분석에 실패한 풀이)
//  왼쪽 목록(오래된 것부터) → 오른쪽에서 원본·인식 결과를 보고 오류 유형을 고르고 저장하면 다음 풀이로 넘어간다
// filter: 오늘의 교실 위쪽에서 고른 과제·기간 (그 과제·기간 풀이만)
export default function ReviewQueue({
  classId,
  filter = {},
  readOnly = false,
  onChange,
}: {
  classId: string;
  filter?: { assignment?: string; from?: number; to?: number };
  readOnly?: boolean;
  onChange?: () => void;
}) {
  const query = new URLSearchParams({
    ...(filter.assignment ? { assignment: filter.assignment } : {}),
    ...(filter.from !== undefined ? { from: String(filter.from) } : {}),
    ...(filter.to !== undefined ? { to: String(filter.to) } : {}),
  }).toString();
  const [items, setItems] = useState<Item[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setItems(null);
    setCurrent(null);
    fetch(`/api/classes/${classId}/review${query ? `?${query}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) return setError(d.error);
        // 오래된 것부터 차례로 처리
        const list = [...(d.submissions as Item[])].sort((a, b) => a.submittedAt - b.submittedAt);
        setItems(list);
        setCurrent(list.find((s) => !s.teacher?.confirmedAt)?.id ?? null);
      })
      .catch(() => alive && setError("확인할 풀이를 불러오지 못했어요."));
    return () => {
      alive = false;
    };
  }, [classId, query]);

  // 실시간 신호(새 제출·다시 분석 결과)가 오면 목록을 다시 받아 합친다.
  //  서버 목록은 '아직 확인 안 한 풀이'만이라, 여기서 방금 확인한 풀이(확인한 것 n개 보기)는 남겨 둔다.
  //  보고 있던 풀이가 목록에서 빠지면 (다른 화면에서 확인함·학생이 다시 냄) 다음 풀이로
  const refresh = useCallback(() => {
    fetch(`/api/classes/${classId}/review${query ? `?${query}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error || !Array.isArray(d.submissions)) return;
        const fresh = d.submissions as Item[];
        setItems((prev) => {
          if (!prev) return prev;
          const byId = new Map(fresh.map((s) => [s.id, s]));
          const kept = prev
            .filter((s) => byId.has(s.id) || isDone(s))
            .map((s) => (byId.has(s.id) && !isDone(s) ? { ...byId.get(s.id)!, studentName: s.studentName } : s));
          const added = fresh.filter((s) => !prev.some((p) => p.id === s.id));
          return [...kept, ...added].sort((a, b) => a.submittedAt - b.submittedAt);
        });
      })
      .catch(() => {});
  }, [classId, query]);
  // 폴링은 없던 화면이라 연결이 안 될 때도 느리게(30초)만
  useLiveRefresh(`class:${classId}`, refresh, { fastMs: 30000 });
  useEffect(() => {
    if (items && current && !items.some((s) => s.id === current)) setCurrent(items.find((s) => !isDone(s))?.id ?? null);
    else if (items && !current) {
      const first = items.find((s) => !isDone(s)); // 다 확인한 뒤 새 풀이가 들어옴
      if (first) setCurrent(first.id);
    }
  }, [items, current]);

  const left = items?.filter((s) => !isDone(s)) ?? [];
  const shown = items?.filter((s) => showDone || !isDone(s) || s.id === current) ?? [];
  const sel = items?.find((s) => s.id === current) ?? null;

  // 저장하면 다음(아직 확인 안 한) 풀이로
  const next = (fromId: string) => {
    if (!items) return;
    const i = items.findIndex((s) => s.id === fromId);
    const after = [...items.slice(i + 1), ...items.slice(0, i)].find((s) => !isDone(s) && s.id !== fromId);
    setTimeout(() => setCurrent(after?.id ?? null), 500); // '✓ 저장했어요'를 잠깐 보여 주고 넘어간다
  };

  if (error) return <p className="rounded-2xl bg-salmon-soft px-4 py-3 text-sm text-[#b5624f]">{error}</p>;
  if (!items) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (!items.length)
    return (
      <div className="rounded-3xl border border-dashed border-line p-8 text-center text-sm text-muted">
        {query ? "고른 과제·기간에는 확인할 풀이가 없어요. 👍" : "확인할 풀이가 없어요. 👍"}
      </div>
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* 목록 */}
      <section className="solid flex flex-col overflow-hidden rounded-3xl border border-line lg:sticky lg:top-36">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-sm">
          <b>남은 {left.length}개</b>
          <span className="text-xs text-muted">오래된 것부터</span>
          {items.length > left.length && (
            <button onClick={() => setShowDone((v) => !v)} className="ml-auto text-xs text-muted underline-offset-2 hover:underline">
              {showDone ? "확인한 것 숨기기" : `확인한 것 ${items.length - left.length}개 보기`}
            </button>
          )}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {shown.map((s) => {
            const reason = REASON[s.status];
            const on = s.id === current;
            return (
              <li key={s.id}>
                <button
                  onClick={() => setCurrent(s.id)}
                  aria-current={on}
                  className={`flex w-full flex-col gap-0.5 border-t border-line/70 px-4 py-2.5 text-left text-sm first:border-t-0 ${
                    on ? "bg-honey-soft" : "hover:bg-sand/60"
                  } ${isDone(s) ? "opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <b>{s.studentName}</b>
                    {isDone(s) ? (
                      <span className="rounded-full bg-sage-soft px-2 py-0.5 text-xs text-[#5d7a50]">✓ 확인함</span>
                    ) : (
                      reason && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${reason.cls}`}>{reason.label}</span>
                    )}
                    <span className="ml-auto text-xs text-muted">{when(s.submittedAt)}</span>
                  </span>
                  <span className="truncate text-muted">{s.question}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 작업 화면 */}
      <section className="solid rounded-3xl border border-line p-5">
        {sel ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="text-base">{sel.studentName}</b>
              <span className="text-muted">{when(sel.submittedAt)} 제출</span>
              <span className="ml-auto text-xs text-muted">원본을 보고 오류 유형을 고르거나 그대로 확인해 주세요</span>
            </div>
            <SubmissionCard
              key={sel.id}
              s={readOnly ? { ...sel, readOnly: true } : sel}
              saveLabel={left.length > 1 ? "확인·저장 후 다음 →" : "확인·저장"}
              onSaved={() => next(sel.id)}
              onUpdate={(n) => {
                setItems((l) => l?.map((x) => (x.id === n.id ? { ...n, studentName: x.studentName } : x)) ?? null);
                onChange?.();
              }}
            />
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted">
            {left.length ? "왼쪽에서 풀이를 골라 주세요." : "모두 확인했어요. 👍"}
          </div>
        )}
      </section>
    </div>
  );
}

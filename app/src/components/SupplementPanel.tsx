"use client";

import { useLiveRefresh } from "@/components/useLiveRefresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { FigureEditor } from "@/components/FigureEditor";
import { solveLinear } from "@/lib/equation";
import type { SupplementCandidate, SupplementDraft, SupplementProgress } from "@/lib/supplement";
import { ERROR_LABEL, formatDue } from "@/lib/types";

type Row = SupplementCandidate & { key: string };

const VERDICT = {
  개선: "bg-sage text-white",
  "부분 개선": "bg-honey text-ink",
  "아직 반복": "bg-[#b5624f] text-white",
  "판단 보류": "bg-sand text-muted",
};
const STATUS = { open: "진행 중", scheduled: "진행 중", closed: "마감", draft: "비공개" };
// 문항 수 고르기 (1~10)
export function CountSelect({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      문항 수
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink disabled:opacity-50"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}개
          </option>
        ))}
      </select>
    </label>
  );
}

const key = () => Math.random().toString(36).slice(2, 9);
const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};

function check(q: string) {
  try {
    return { ok: true as const, s: solveLinear(q) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

// 후보 문항 확인: 방정식은 풀이기로, 이전 과정 복습 계산 문항·문장제는 함께 받은 정답으로
export function checkRow(r: Pick<SupplementCandidate, "question" | "answer" | "calc">) {
  if (r.calc && r.answer) return { ok: true as const, s: { answer: r.answer } };
  return check(r.question);
}
// 고친 문항: 계산 문항은 정답을 모르게 되니 계산 표시를 뗀다 (방정식으로 다시 쓰면 풀이기가 정답을 만든다)
export const editRow = <T extends SupplementCandidate>(r: T, question: string): T => (r.calc ? { ...r, question, calc: false, answer: "" } : { ...r, question });
// 보낼 문항: 문제은행 문항은 개념·틀 id, 계산 문항·문장제는 정답·개념도
export const toQuestion = (r: SupplementCandidate) => ({
  question: r.question,
  ...(r.templateId ? { concept: r.concept, templateId: r.templateId } : {}),
  ...(r.calc ? { answer: r.answer, concept: r.concept } : {}),
  ...(r.figure ? { figure: r.figure } : {}),
});

// 보충 지도: AI가 보충 문항을 만들고 → 교사가 확인·수정해 이 학생에게 배정 → 재풀이 → 전후 비교·AI 변화 분석
export default function SupplementPanel({ studentId, openSignal }: { studentId: string; openSignal?: number }) {
  const [progress, setProgress] = useState<SupplementProgress[]>([]);
  const [draft, setDraft] = useState<(SupplementDraft & { title: string; withDue: boolean }) | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<"" | "draft" | "assign" | string>("");
  const [count, setCount] = useState(3);
  const [showAll, setShowAll] = useState(false); // 보충 기록은 최근 2개만, 나머지는 접어 둔다
  const countRef = useRef(count); // AI 요약 버튼으로 열 때도 지금 고른 개수로
  countRef.current = count;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ref = useRef<HTMLElement>(null);

  const load = useCallback(
    () =>
      fetch(`/api/students/${studentId}/supplement`)
        .then((r) => r.json())
        .then((d) => Array.isArray(d) && setProgress(d))
        .catch(() => {}),
    [studentId],
  );
  useEffect(() => {
    load();
  }, [load]);
  // 학생이 보충 문항을 풀면 바로 반영 (실시간 신호. 설정이 없으면 5초 폴링)
  useLiveRefresh(`student:${studentId}`, load, { fastMs: 5000 });

  const makeDraft = useCallback(async (n?: number) => {
    setBusy("draft");
    setError("");
    setNotice("");
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const res = await fetch(`/api/students/${studentId}/supplement/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: n ?? countRef.current }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDraft({ ...d, title: `보충 · ${d.concept}`, withDue: true });
      setRows(d.candidates.map((c: SupplementCandidate) => ({ ...c, key: key() })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [studentId]);

  // AI 요약의 '보충 문항 만들기' 버튼에서 열기
  useEffect(() => {
    if (openSignal) makeDraft();
  }, [openSignal, makeDraft]);

  const assign = async () => {
    if (!draft) return;
    setBusy("assign");
    setError("");
    try {
      const res = await fetch(`/api/students/${studentId}/supplement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          concept: draft.concept,
          targetError: draft.targetError,
          sourceSubmissionIds: draft.sourceSubmissionIds,
          dueAt: draft.withDue ? tomorrow() : null,
          // 문제은행 문항은 틀의 개념·틀 id 를 같이 보낸다
          questions: rows.filter((r) => r.question.trim()).map(toQuestion),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNotice(`'${d.title}' ${d.problems.length}문항을 이 학생에게 배정했어요. 학생 과제 목록에 바로 나타나요.`);
      setDraft(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const review = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/assignments/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }), // 소그룹 보충이면 이 학생 기준으로 분석
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const validCount = rows.filter((r) => r.question.trim() && checkRow(r).ok).length;

  return (
    <section ref={ref} className="scroll-mt-20 rounded-3xl border border-sage/50 bg-paper p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">보충 지도</h2>
        {!draft && (
          <div className="ml-auto flex items-center gap-2">
            <CountSelect value={count} onChange={setCount} disabled={busy === "draft"} />
            <button
              onClick={() => makeDraft()}
              disabled={busy === "draft"}
              className="rounded-full bg-sage px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4d6842] disabled:opacity-50"
            >
              {busy === "draft" ? "만드는 중…" : `보충 문항 ${count}개 만들기`}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 rounded-xl bg-salmon-soft px-3 py-2 text-sm text-[#b5624f]">{error}</p>}
      {notice && <p className="mt-3 rounded-xl bg-sage-soft px-3 py-2 text-sm text-[#5d7a50]">{notice}</p>}

      {/* 1. 보충 문항 확인·수정 */}
      {draft && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-honey bg-honey-soft/30 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-honey px-2.5 py-0.5 text-xs font-semibold">{draft.concept}</span>
            {draft.targetError && <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs">목표 오류: {ERROR_LABEL[draft.targetError]}</span>}
          </div>

          {draft.adapted?.length > 0 && (
            <div className="rounded-xl bg-sage-soft/60 px-3 py-2 text-xs text-[#5d7a50]">
              <b>학습 기록 반영</b>
              <ul className="mt-1 list-disc pl-5">
                {draft.adapted.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.basis.length > 0 && (
            <div className="text-xs text-muted">
              <b>근거로 쓴 오답</b>
              <ul className="mt-1 list-disc pl-5">
                {draft.basis.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">과제 이름</span>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="input py-2 text-sm" />
          </label>

          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const c = checkRow(r);
              return (
                <div key={r.key} className="rounded-xl border border-line bg-paper p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-honey-soft text-xs font-bold">{i + 1}</span>
                    <input
                      value={r.question}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? editRow(x, e.target.value) : x)))}
                      className="input py-1.5 font-[family-name:var(--font-math)] italic"
                    />
                    <button
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      aria-label="문항 삭제"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sand"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 pl-8">
                    <FigureEditor figure={r.figure} onChange={(figure) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, figure } : x)))} />
                  </div>
                  <div className="mt-1.5 pl-8 text-xs">
                    {c.ok ? (
                      <span className="text-[#5d7a50]">✓ 정답 {c.s.answer}</span>
                    ) : (
                      <span className="text-[#b5624f]">{r.question.trim() ? c.error : "식을 입력해 주세요"}</span>
                    )}
                    {r.why && <span className="ml-2 text-muted">· {r.why}</span>}
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setRows((rs) => [...rs, { key: key(), question: "", answer: "", concept: draft.concept, why: "", source: "rule" }])}
              className="rounded-xl border border-dashed border-line py-2 text-xs text-muted hover:bg-sand"
            >
              + 문항 직접 추가
            </button>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.withDue} onChange={(e) => setDraft({ ...draft, withDue: e.target.checked })} className="h-4 w-4 accent-[#e2b53c]" />
            내일 밤({formatDue(tomorrow())})까지 마감
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={assign}
              disabled={busy === "assign" || validCount === 0}
              className="rounded-full bg-sage px-5 py-2.5 font-semibold text-white transition hover:bg-[#4d6842] disabled:opacity-40"
            >
              {busy === "assign" ? "배정 중…" : `${rows.filter((r) => r.question.trim()).length}문항 배정하기 →`}
            </button>
            <button onClick={() => makeDraft()} disabled={!!busy} className="rounded-full border border-line px-4 py-2.5 text-muted hover:bg-sand disabled:opacity-40">
              {busy === "draft" ? "다시 만드는 중…" : "↻ 다시 만들기"}
            </button>
            <CountSelect
              value={count}
              disabled={!!busy}
              onChange={(n) => {
                setCount(n);
                makeDraft(n); // 개수를 바꾸면 그 개수로 다시 만든다
              }}
            />
            <button onClick={() => setDraft(null)} className="text-xs text-muted underline">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 2. 보충 기록: 보충 전 → 후 */}
      {progress.length === 0 && !draft && (
        <p className="mt-3 text-sm text-muted">아직 배정한 보충 과제가 없어요.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {(showAll ? progress : progress.slice(0, 2)).map((p) => {
          const rate = p.after.judged ? Math.round((p.after.correct / p.after.judged) * 100) : null;
          return (
            <div key={p.id} className="rounded-2xl border border-line p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{p.title}</b>
                {p.group && (
                  <span className="rounded-full bg-honey-soft px-2 py-0.5 text-xs text-olive" title={p.group.name}>
                    소그룹 · {p.group.size}명
                  </span>
                )}
                <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">{STATUS[p.status]}</span>
                {p.dueAt && p.status !== "closed" && <span className="text-xs text-muted">{formatDue(p.dueAt)} 마감</span>}
                {p.review && <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[p.review.verdict]}`}>{p.review.verdict}</span>}
              </div>

              <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-xl bg-salmon-soft/50 p-3">
                  <div className="text-xs text-muted">보충 전</div>
                  <div className="mt-1">
                    오답 <b>{p.before.wrong}</b>/{p.before.count}
                    {p.targetError && (
                      <>
                        {" "}
                        · {ERROR_LABEL[p.targetError]} <b>{p.before.targetErrors}</b>회
                      </>
                    )}
                  </div>
                </div>
                <span className="text-center text-lg text-muted">→</span>
                <div className="rounded-xl bg-sage-soft/60 p-3">
                  <div className="text-xs text-muted">보충 후</div>
                  <div className="mt-1">
                    {p.after.submitted === 0 ? (
                      <span className="text-muted">아직 풀지 않았어요</span>
                    ) : (
                      <>
                        정답 <b>{p.after.correct}</b>/{p.after.judged}
                        {rate !== null && <span className="text-muted"> ({rate}%)</span>}
                        {p.targetError && (
                          <>
                            {" "}
                            · {ERROR_LABEL[p.targetError]} <b className={p.after.targetErrors ? "text-[#b5624f]" : "text-[#5d7a50]"}>{p.after.targetErrors}</b>회
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {p.after.submitted}/{p.after.total}문항 제출{p.after.review ? ` · 확인 필요 ${p.after.review}` : ""}
                  </div>
                </div>
              </div>

              {p.review && (
                <div className="mt-3 rounded-xl bg-honey-soft/50 p-3">
                  <div className="text-xs text-muted">AI 변화 분석</div>
                  <p className="mt-1">{p.review.summary}</p>
                  {p.review.remaining.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {p.review.remaining.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {p.review.nextStep && (
                    <p className="mt-1">
                      <span className="text-muted">다음 지도</span> {p.review.nextStep}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => review(p.id)}
                  disabled={!!busy || p.after.submitted === 0}
                  title={p.after.submitted === 0 ? "학생이 보충 문항을 풀면 분석할 수 있어요" : ""}
                  className="rounded-full border border-honey px-4 py-2 text-sm text-olive hover:bg-honey-soft disabled:opacity-40"
                >
                  {busy === p.id ? "비교하는 중…" : p.review ? "↻ 다시 분석" : "AI 변화 분석"}
                </button>
              </div>
            </div>
          );
        })}
        {progress.length > 2 && (
          <button onClick={() => setShowAll((v) => !v)} className="self-center rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:bg-sand">
            {showAll ? "최근 보충만 보기" : `이전 보충 ${progress.length - 2}개 더 보기`}
          </button>
        )}
      </div>
    </section>
  );
}

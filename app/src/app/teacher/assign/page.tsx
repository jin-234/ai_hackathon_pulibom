"use client";
import QuestionText from "@/components/QuestionText";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { CurriculumPicker } from "@/components/CurriculumPicker";
import { DateTimePicker } from "@/components/DateTimePicker";
import { FigureEditor } from "@/components/FigureEditor";
import FigureView from "@/components/FigureView";
import type { Figure } from "@/lib/figure";
import { useTeacherClass } from "@/components/useTeacherClass";
import { makeVariants, solveLinear, type Solved } from "@/lib/equation";
import { formatDue, statusOf, type Assignment as BaseAssignment, type AssignmentStatus } from "@/lib/types";
import { CHOICE_MARKS, choiceBody, choiceMark, FORMAT_LABEL, formatOf, joinChoices, splitChoices, type ProblemFormat } from "@/lib/problemFormat";

// 목록 API: 정해진 학생에게만 낸 과제(보충)는 받은 학생과 낸 문항 수가 같이 온다
type Recipient = { id: string; name: string; number: number | null; solved: number };
type Assignment = BaseAssignment & { recipients?: Recipient[] };

// "YYYY-MM-DDTHH:mm" (DateTimePicker 값) <-> ms
const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);
const plusHours = (h: number) => toLocalInput(Math.ceil((Date.now() + h * 3600000) / 600000) * 600000);

const STATUS_BADGE: Record<AssignmentStatus, { label: string; cls: string }> = {
  draft: { label: "비공개", cls: "bg-sand text-muted" },
  open: { label: "진행 중", cls: "bg-sage text-white" },
  scheduled: { label: "진행 중 · 마감 예약", cls: "bg-honey text-ink" },
  closed: { label: "마감", cls: "bg-[#b5624f] text-white" },
};

// templateId: 문제은행 틀에서 만든 문항 (교육과정). 문제를 고치면 틀·정답 연결을 뗀다
// ai: AI 가 만든 문항 초안 (정답을 교사가 확인해야 함)
// figure: 문항 그림 (AI 가 만든 설계도 또는 선생님이 올린 이미지)
// format: 객관식이면 question 은 문제 글만, 보기는 options (번호 없이), 정답은 correct (보기 순서)
type Draft = {
  key: string;
  question: string;
  answer: string;
  solution: string;
  concept: string;
  open: boolean;
  templateId?: string;
  ai?: boolean;
  figure?: Figure;
  format: ProblemFormat;
  options: string[];
  correct: number | null;
};

const newKey = () => Math.random().toString(36).slice(2, 9);
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;
const emptyOptions = () => Array.from({ length: MAX_OPTIONS }, () => "");
const emptyDraft = (question = "", format: ProblemFormat = "essay"): Draft => ({
  key: newKey(),
  question,
  answer: "",
  solution: "",
  concept: "",
  open: false,
  format,
  options: emptyOptions(),
  correct: null,
});

// "문제 글 ① 보기 ② 보기 …" + 정답 "③ …" → 객관식 칸 (문제 글 · 보기 · 정답 순서)
function splitToChoice(question: string, answer: string): Pick<Draft, "question" | "options" | "correct"> {
  const { stem, choices } = splitChoices(question);
  const mark = choiceMark(answer);
  const k = mark ? choices.findIndex((c) => c.startsWith(mark)) : -1;
  return { question: stem, options: choices.map(choiceBody), correct: k >= 0 ? k : null };
}

// 출제할 때 보낼 문제 글·정답. 객관식은 빈 보기를 빼고 번호를 다시 매긴다
function toQuestion(d: Draft): { question: string; answer: string } {
  if (d.format !== "choice") return { question: d.question, answer: d.answer };
  const filled = d.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const at = filled.findIndex((x) => x.i === d.correct);
  return { question: joinChoices(d.question, filled.map((x) => x.o)), answer: at >= 0 ? CHOICE_MARKS[at] : "" };
}
const filledOptions = (d: Draft) => d.options.filter((o) => o.trim()).length;
// 고른 정답 보기의 새 번호 (빈 보기를 뺀 순서)
const correctMark = (d: Draft) => (d.correct !== null && d.options[d.correct]?.trim() ? toQuestion(d).answer : "");

function trySolve(q: string): Solved | null {
  if (!q.trim()) return null;
  try {
    return solveLinear(q);
  } catch {
    return null;
  }
}

export default function AssignPage() {
  // 과제는 반마다 따로. 보관된 지난 반에는 낼 수 없으니 올해 반만 고른다
  const { classes, selected: cls, select: selectClass, loading: classLoading, error: classError } = useTeacherClass({ currentOnly: true });
  const classId = cls?.id;
  const [list, setList] = useState<Assignment[]>([]);
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [publish, setPublish] = useState(true);
  const [due, setDue] = useState("");
  const [scheduling, setScheduling] = useState<{ id: string; value: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000); // 예약 마감 시각이 지나면 상태가 바뀌도록
    return () => clearInterval(t);
  }, []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  // 출제한 과제 목록 거르기 · 문항 펼치기 (기본: 진행 중인 과제, 문항은 접어 둠)
  const [listState, setListState] = useState<"active" | "closed" | "all">("active");
  const [listKind, setListKind] = useState<"all" | "normal" | "supplement">("all");
  const [openList, setOpenList] = useState<Set<string>>(new Set());
  // 출제한 과제 목록에서 정답 고치는 중인 문항
  const [answerEdit, setAnswerEdit] = useState<{ assignmentId: string; problemId: string; value: string } | null>(null);
  const [openWho, setOpenWho] = useState<string | null>(null); // 보충 받은 학생 목록을 펼친 과제
  const load = useCallback(() => {
    if (!classId) return setList([]);
    fetch(`/api/assignments?class=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [classId]);
  useEffect(() => {
    load();
  }, [load]);

  const kindOf = (a: Assignment) => (a.supplement ? "supplement" : "normal");
  const stateOk = (a: Assignment) => (listState === "all" ? true : (statusOf(a, now) === "closed") === (listState === "closed"));
  const shownList = list.filter((a) => stateOk(a) && (listKind === "all" || kindOf(a) === listKind));
  const kindCount = (k: typeof listKind) => list.filter((a) => stateOk(a) && (k === "all" || kindOf(a) === k)).length;
  const toggleList = (id: string) =>
    setOpenList((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const solved = useMemo(() => drafts.map((d) => (d.format === "essay" ? trySolve(d.question) : null)), [drafts]);
  const count = drafts.filter((d) => d.question.trim()).length;
  const formatCount = (f: ProblemFormat) => drafts.filter((d) => d.question.trim() && d.format === f).length;

  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        // 문제은행 문항의 문제를 고치면 정답을 모르게 되니 틀·정답 연결을 뗀다 (개념은 남김)
        if (d.templateId && p.question !== undefined && p.question !== d.question) return { ...d, ...p, templateId: undefined, answer: "" };
        return { ...d, ...p };
      }),
    );
  // 유형 바꾸기: 서술형 → 객관식은 문제 글에 ①②가 있으면 보기로 나눠 넣고, 객관식 → 서술형은 문제 글만 남긴다 (보기는 기억해 둠)
  const setFormat = (key: string, format: ProblemFormat) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key || d.format === format) return d;
        if (format === "choice") {
          const split = splitToChoice(d.question, d.answer);
          const options = split.options.length ? [...split.options, ...emptyOptions()].slice(0, Math.max(MAX_OPTIONS, split.options.length)) : d.options;
          return { ...d, format, templateId: undefined, ...(split.options.length ? { ...split, options } : {}) };
        }
        const picked = d.correct !== null ? d.options[d.correct]?.trim() : "";
        return { ...d, format, answer: picked || d.answer };
      }),
    );
  const patchOption = (key: string, k: number, value: string) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, options: d.options.map((o, i) => (i === k ? value : o)) } : d)));
  const removeOption = (key: string, k: number) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key || d.options.length <= MIN_OPTIONS) return d;
        const correct = d.correct === k ? null : d.correct !== null && d.correct > k ? d.correct - 1 : d.correct;
        return { ...d, options: d.options.filter((_, i) => i !== k), correct };
      }),
    );
  const remove = (key: string) => setDrafts((ds) => (ds.length > 1 ? ds.filter((d) => d.key !== key) : [emptyDraft()]));
  const addVariants = (i: number) => {
    const v = makeVariants(drafts[i].question, 3).map((q) => emptyDraft(q));
    setDrafts((ds) => [...ds.slice(0, i + 1), ...v, ...ds.slice(i + 1)]);
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const questions = drafts
        .filter((d) => d.question.trim())
        .map((d) => ({
          ...toQuestion(d),
          solution: d.solution,
          concept: d.concept,
          format: d.format,
          ...(d.templateId ? { templateId: d.templateId } : {}),
          ...(d.figure ? { figure: d.figure } : {}),
        }));
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, title, publish, dueAt: fromLocalInput(due), questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({
        ok: true,
        text: `${cls?.label ?? ""} '${data.title}' ${data.problems.length}문항을 출제했어요.${publish ? " 학생 과제 목록에 바로 나타나요." : " 비공개로 저장했어요."}`,
      });
      setDrafts([emptyDraft()]);
      setDue("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, body: object, method: "PATCH" | "DELETE" = "PATCH") => {
    const res = await fetch(`/api/assignments/${id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PATCH" ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) alert((await res.json()).error);
    load();
    return res.ok;
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold">
          오늘 풀어 볼 문제를 <span className="text-olive">골라 볼까요?</span>
        </h1>
        <p className="mt-1 text-sm text-muted">반 학년의 교육과정 단원을 고르면 문항을 만들어 줘요. 일차방정식은 정답과 해설이 자동이에요.</p>
      </div>

      {/* minmax(0, …): 오른쪽 목록에 긴 문항이 있어도 칸 너비가 늘어나 왼쪽 폼을 밀지 않게 */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* 출제 폼 */}
        <div className="flex flex-col gap-4 self-start rounded-3xl border border-line bg-paper p-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">과제를 낼 반</span>
            <select
              value={classId ?? ""}
              onChange={(e) => {
                selectClass(e.target.value);
                setMsg(null);
              }}
              disabled={!classes.length}
              className="input"
            >
              {!classes.length && <option value="">{classLoading ? "반 불러오는 중…" : "올해 담당 반이 없어요"}</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {classError && <span className="text-xs text-[#b5624f]">{classError}</span>}
          </label>
          {cls && (
            <CurriculumPicker
              key={cls.id}
              classId={cls.id}
              grade={cls.grade}
              onTitle={setTitle}
              onItems={(items) =>
                // 이미 입력한 문항은 두고 뒤에 붙인다 (빈 칸은 뺌)
                setDrafts((ds) => [
                  ...ds.filter((d) => d.question.trim()),
                  ...items.map((it) => ({
                    // 유형은 문제 글로 정한다 (AI 객관식 문항은 question 끝에 ① ~ ⑤ 보기가 붙어 온다)
                    ...emptyDraft(it.question, formatOf(it)),
                    ...(formatOf(it) === "choice" ? splitToChoice(it.question, it.answer) : {}),
                    answer: it.answer,
                    concept: it.concept,
                    solution: it.solution.join("\n"),
                    ...(it.templateId ? { templateId: it.templateId } : {}),
                    ...(it.source === "ai" ? { ai: true } : {}),
                    ...(it.figure ? { figure: it.figure } : {}),
                  })),
                ])
              }
            />
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">과제 이름</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="과제 이름을 입력하세요" className="input" />
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted">문항</span>
              {count > 0 && (
                <span className="text-[11px] text-muted">
                  객관식 {formatCount("choice")} · 서술형 {formatCount("essay")}
                </span>
              )}
            </div>
            {drafts.map((d, i) => {
              const s = solved[i];
              const hasText = d.question.trim().length > 0;
              const choice = d.format === "choice";
              const mark = choice ? correctMark(d) : "";
              return (
                <div key={d.key} className="rounded-2xl border border-line bg-cream/60 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-honey-soft text-xs font-bold">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div role="radiogroup" aria-label={`${i + 1}번 문항 유형`} className="flex w-fit rounded-full border border-line bg-paper p-0.5 text-xs">
                        {(["essay", "choice"] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            role="radio"
                            aria-checked={d.format === f}
                            onClick={() => setFormat(d.key, f)}
                            className={`rounded-full px-3 py-1 ${d.format === f ? "bg-honey font-semibold text-ink" : "text-muted hover:bg-sand"}`}
                          >
                            {FORMAT_LABEL[f]}
                          </button>
                        ))}
                      </div>
                      <AutoGrowTextarea
                        value={d.question}
                        onChange={(e) => patch(d.key, { question: e.target.value })}
                        placeholder={choice ? "객관식 문제를 입력하세요 (예: 다음 중 x^2 - 4 를 인수분해한 것은?)" : "식이나 문장형 문제를 자유롭게 입력하세요"}
                        className="input min-h-11 resize-none"
                      />
                      {/* 객관식 보기: 번호를 누르면 정답으로 정해진다 */}
                      {choice && (
                        <div className="flex flex-col gap-1.5">
                          {d.options.map((o, k) => {
                            const on = d.correct === k;
                            return (
                              <div key={k} className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  aria-label={`${k + 1}번 보기를 정답으로`}
                                  title="정답으로 정하기"
                                  onClick={() => patch(d.key, { correct: on ? null : k })}
                                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition ${
                                    on ? "bg-sage font-bold text-white" : "border border-line bg-paper text-ink hover:bg-sand"
                                  }`}
                                >
                                  {CHOICE_MARKS[k]}
                                </button>
                                <input
                                  value={o}
                                  onChange={(e) => patchOption(d.key, k, e.target.value)}
                                  placeholder={`보기 ${k + 1}`}
                                  className={`input py-1.5 text-sm ${on ? "border-sage" : ""}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(d.key, k)}
                                  disabled={d.options.length <= MIN_OPTIONS}
                                  aria-label={`${k + 1}번 보기 삭제`}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs text-muted hover:bg-sand disabled:opacity-30"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                          {d.options.length < MAX_OPTIONS && (
                            <button
                              type="button"
                              onClick={() => patch(d.key, { options: [...d.options, ""] })}
                              className="w-fit rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted hover:bg-sand"
                            >
                              + 보기 추가
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => remove(d.key)} aria-label="문항 삭제" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-sand">
                      ✕
                    </button>
                  </div>

                  <div className="mt-2 pl-9">
                    <FigureEditor figure={d.figure} onChange={(figure) => patch(d.key, { figure })} />
                  </div>
                  {hasText && (
                    <div className="mt-2 flex flex-col gap-2 pl-9 text-xs">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {choice ? (
                          <>
                            {filledOptions(d) < MIN_OPTIONS ? (
                              <span className="rounded-full bg-salmon-soft px-2.5 py-1 text-[#b5624f]">보기를 두 개 이상 입력해 주세요</span>
                            ) : mark ? (
                              <span className={`rounded-full px-2.5 py-1 ${d.ai ? "bg-honey-soft text-olive" : "bg-sage-soft text-[#5d7a50]"}`}>
                                {d.ai ? `AI 초안 · 정답 ${mark} 확인해 주세요` : `✓ 정답 ${mark}`}
                              </span>
                            ) : (
                              <span className="rounded-full bg-salmon-soft px-2.5 py-1 text-[#b5624f]">보기 번호를 눌러 정답을 골라 주세요</span>
                            )}
                            {d.concept.trim() && <span className="rounded-full bg-sand px-2.5 py-1 text-muted">{d.concept}</span>}
                          </>
                        ) : d.templateId ? (
                          <>
                            <span className="rounded-full bg-sage-soft px-2.5 py-1 text-[#5d7a50]">✓ 정답 {d.answer}</span>
                            <span className="rounded-full bg-sand px-2.5 py-1 text-muted">{d.concept}</span>
                            <span className="text-muted">문제은행</span>
                          </>
                        ) : d.ai ? (
                          <>
                            <span className="rounded-full bg-honey-soft px-2.5 py-1 text-olive">AI 초안 · 정답 {d.answer.trim() || "없음"} 확인해 주세요</span>
                            <span className="rounded-full bg-sand px-2.5 py-1 text-muted">{d.concept}</span>
                          </>
                        ) : s ? (
                          <>
                            <span className="rounded-full bg-sage-soft px-2.5 py-1 text-[#5d7a50]">✓ 정답 {d.answer.trim() || s.answer}</span>
                            <span className="rounded-full bg-sand px-2.5 py-1 text-muted">{d.concept.trim() || s.concept}</span>
                            <button onClick={() => addVariants(i)} className="rounded-full border border-honey px-2.5 py-1 text-olive hover:bg-honey-soft">
                              + 비슷한 문항 3개
                            </button>
                          </>
                        ) : (
                          <span className="text-muted">정답을 적어 두면 채점이 정확해져요</span>
                        )}
                        <button
                          onClick={() => patch(d.key, { open: !d.open })}
                          aria-expanded={d.open}
                          className="ml-auto rounded-full px-2.5 py-1 text-muted underline-offset-2 hover:underline"
                        >
                          {d.open ? "접기" : choice ? "개념·해설 입력" : s || d.templateId || d.ai ? "정답·해설 수정" : "정답·해설 입력"}
                        </button>
                      </div>
                      {d.open && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {!choice && (
                          <input
                            value={d.answer}
                            onChange={(e) => patch(d.key, { answer: e.target.value })}
                            placeholder={s ? `정답 (비우면 ${s.answer})` : "정답 (예: x = 4, 12개)"}
                            className="input text-sm"
                          />
                          )}
                          <input
                            value={d.concept}
                            onChange={(e) => patch(d.key, { concept: e.target.value })}
                            placeholder={s ? `관련 개념 (비우면 ${s.concept})` : "관련 개념 (예: 일차방정식의 활용)"}
                            className={`input text-sm ${choice ? "sm:col-span-2" : ""}`}
                          />
                          <textarea
                            value={d.solution}
                            onChange={(e) => patch(d.key, { solution: e.target.value })}
                            rows={3}
                            placeholder={s ? `해설 (한 줄에 한 단계, 비우면 자동 해설)` : "해설 (한 줄에 한 단계)"}
                            className="input text-sm sm:col-span-2"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2">
              {(["essay", "choice"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDrafts((ds) => [...ds, emptyDraft("", f)])}
                  className="rounded-2xl border border-dashed border-line py-2.5 text-sm text-muted hover:bg-sand"
                >
                  + {FORMAT_LABEL[f]} 문항 추가
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-[#e2b53c]" />
            출제하면 바로 학생들에게 공개하기
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">마감 (선택)</span>
            <div className="flex flex-wrap items-center gap-2">
              <DateTimePicker value={due} min={toLocalInput(now)} onChange={setDue} placeholder="시간 선택" />
              {[["1시간 뒤", 1], ["오늘 밤", 0], ["내일", 24], ["일주일", 168]].map(([label, h]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (h === 0) {
                      const d = new Date();
                      d.setHours(23, 59, 0, 0);
                      setDue(toLocalInput(d.getTime()));
                    } else setDue(plusHours(h as number));
                  }}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-sand"
                >
                  {label}
                </button>
              ))}
              {due && (
                <button type="button" onClick={() => setDue("")} className="text-xs text-muted underline">
                  없음
                </button>
              )}
            </div>
            {due && <span className="text-xs text-olive">{formatDue(fromLocalInput(due)!)}에 자동으로 마감돼요.</span>}
          </div>

          {msg && (
            <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-sage-soft text-[#5d7a50]" : "bg-salmon-soft text-[#b5624f]"}`}>{msg.text}</p>
          )}

          <button
            onClick={submit}
            disabled={busy || count === 0 || !title.trim() || !classId}
            className="rounded-2xl bg-honey py-3 font-semibold transition hover:bg-honey-deep disabled:opacity-40"
          >
            {busy ? "출제 중…" : !title.trim() ? "과제 이름을 입력해 주세요" : `${count}문항 출제하기 →`}
          </button>
        </div>

        {/* 출제한 과제 */}
        <div className="flex flex-col gap-3">
          <h2 className="font-bold">
            출제한 과제 {cls && <span className="text-sm font-normal text-muted">· {cls.label}</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                ["active", "진행 중"],
                ["closed", "마감"],
                ["all", "전체"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setListState(k)}
                className={`rounded-full px-3 py-1 ${listState === k ? "bg-honey font-semibold text-ink" : "border border-line text-muted hover:bg-sand"}`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            {(
              [
                ["all", "모든 종류"],
                ["normal", "일반"],
                ["supplement", "보충"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setListKind(k)}
                className={`rounded-full border px-3 py-1 ${listKind === k ? "border-honey bg-honey-soft font-semibold" : "border-line text-muted hover:bg-sand"}`}
              >
                {label} {kindCount(k)}
              </button>
            ))}
          </div>
          {cls && list.length === 0 && (
            <div className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">이 반에 낸 과제가 아직 없어요.</div>
          )}
          {cls && list.length > 0 && shownList.length === 0 && (
            <div className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {listState === "active" ? "진행 중인 과제가 없어요." : "해당하는 과제가 없어요."}
            </div>
          )}
          {shownList.map((a) => (
            <div
              key={a.id}
              // 카드마다 유리 효과(backdrop-filter)로 쌓임 순서가 따로 생겨, '⋯' 메뉴·마감 예약 달력이 다음 카드 밑에 깔린다 → 열린 카드만 위로
              className={`relative rounded-3xl border p-4 has-[details[open]]:z-30 ${scheduling?.id === a.id ? "z-30" : ""} ${
                statusOf(a, now) === "closed" ? "border-line bg-sand/50" : a.published ? "border-honey bg-honey-soft/50" : "border-line bg-paper"
              }`}
            >
              {editing?.id === a.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await update(a.id, { title: editing.title })) setEditing(null);
                  }}
                >
                  <input
                    autoFocus
                    value={editing.title}
                    onChange={(e) => setEditing({ id: a.id, title: e.target.value })}
                    className="input py-1.5 text-sm"
                  />
                  <button type="submit" className="shrink-0 rounded-full bg-sage px-3 text-xs text-white">저장</button>
                  <button type="button" onClick={() => setEditing(null)} className="shrink-0 rounded-full border border-line px-3 text-xs text-muted">
                    취소
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.title}</span>
                  <button
                    onClick={() => setEditing({ id: a.id, title: a.title })}
                    aria-label="과제 이름 수정"
                    title="과제 이름 수정"
                    className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-sand"
                  >
                    ✎
                  </button>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[statusOf(a, now)].cls}`}>
                    {STATUS_BADGE[statusOf(a, now)].label}
                  </span>
                </div>
              )}
              <div className="mt-1 text-xs text-muted">
                {a.supplement ? (
                  <button
                    onClick={() => setOpenWho((cur) => (cur === a.id ? null : a.id))}
                    aria-expanded={openWho === a.id}
                    title="받은 학생 보기"
                    className="mr-1 rounded-full bg-honey px-2 py-0.5 font-semibold text-ink hover:bg-honey-deep"
                  >
                    보충 · {a.studentIds?.length}명 {openWho === a.id ? "▲" : "▼"}
                  </button>
                ) : null}
                {a.problems.length}문항
                {(() => {
                  const nc = a.problems.filter((p) => formatOf(p) === "choice").length;
                  return nc ? ` (객관식 ${nc} · 서술형 ${a.problems.length - nc})` : "";
                })()}
                {a.createdAt
                  ? ` · ${new Date(a.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : " · 기본 시연 과제"}
                {a.closedAt ? ` · ${formatDue(a.closedAt)} 마감함` : a.dueAt ? ` · ${formatDue(a.dueAt)} ${a.dueAt <= now ? "마감됨" : "마감 예정"}` : ""}
              </div>
              {openWho === a.id && a.recipients && (
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {a.recipients.map((r) => {
                    const all = a.problems.length > 0 && r.solved >= a.problems.length;
                    return (
                      <li key={r.id}>
                        <a
                          href={`/teacher/students/${r.id}`}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 hover:bg-sand ${all ? "border-sage/50 bg-sage-soft/60" : "border-line bg-paper"}`}
                        >
                          {r.number !== null && <span className="text-muted">{r.number}번</span>}
                          <b>{r.name}</b>
                          <span className={all ? "text-[#5d7a50]" : "text-muted"}>{all ? "✓ 다 냄" : `${r.solved}/${a.problems.length}`}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button onClick={() => toggleList(a.id)} aria-expanded={openList.has(a.id)} className="mt-2 text-xs text-muted underline-offset-2 hover:underline">
                {openList.has(a.id) ? "문항 접기 ▲" : `문항 ${a.problems.length}개 보기 ▼`}
              </button>
              {openList.has(a.id) && (
                <ol className="mt-2 flex flex-col gap-1">
                  {a.problems.map((p, i) => (
                    <li key={p.id} className="flex gap-2 rounded-xl bg-paper/80 px-3 py-1.5 text-sm leading-relaxed">
                      <span className="shrink-0 text-xs leading-6 text-muted">{i + 1}</span>
                      <span
                        className={`mt-0.5 shrink-0 self-start rounded-full px-1.5 py-0.5 text-[10px] leading-4 ${
                          formatOf(p) === "choice" ? "bg-honey-soft text-olive" : "bg-sand text-muted"
                        }`}
                      >
                        {FORMAT_LABEL[formatOf(p)]}
                      </span>
                      <span className={`min-w-0 break-words ${p.free ? "" : "font-[family-name:var(--font-math)] italic"}`}>
                        <QuestionText text={p.question} />
                        {p.figure && <FigureView figure={p.figure} className="mt-1.5" />}
                      </span>
                      {/* 설정한 정답 (비워 둔 일차방정식은 풀이기 정답). 누르면 고치기 */}
                      {answerEdit?.problemId === p.id && formatOf(p) === "choice" ? (
                        // 객관식: 보기 번호를 눌러 정답을 바로 바꾼다
                        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1 self-start">
                          {splitChoices(p.question).choices.map((c) => {
                            const m = c.charAt(0);
                            const on = choiceMark(p.answer) === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                title={c}
                                onClick={async () => (await update(a.id, { answer: { problemId: p.id, answer: m } })) && setAnswerEdit(null)}
                                className={`grid h-7 w-7 place-items-center rounded-full text-sm ${on ? "bg-sage font-bold text-white" : "border border-line bg-white hover:bg-sand"}`}
                              >
                                {m}
                              </button>
                            );
                          })}
                          <button type="button" onClick={() => setAnswerEdit(null)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                            취소
                          </button>
                        </div>
                      ) : answerEdit?.problemId === p.id ? (
                        <form
                          className="ml-auto flex shrink-0 items-center gap-1 self-start"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (await update(a.id, { answer: { problemId: p.id, answer: answerEdit.value } })) setAnswerEdit(null);
                          }}
                        >
                          <input
                            autoFocus
                            value={answerEdit.value}
                            onChange={(e) => setAnswerEdit({ ...answerEdit, value: e.target.value })}
                            onKeyDown={(e) => e.key === "Escape" && setAnswerEdit(null)}
                            placeholder={trySolve(p.question) ? `비우면 ${trySolve(p.question)!.answer}` : "정답 (예: x = 4)"}
                            maxLength={200}
                            className="w-32 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs"
                          />
                          <button type="submit" className="rounded-full bg-sage px-2.5 py-0.5 text-xs text-white">저장</button>
                          <button type="button" onClick={() => setAnswerEdit(null)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                            취소
                          </button>
                        </form>
                      ) : (
                        (() => {
                          // 객관식은 번호만 짧게
                          const ans = formatOf(p) === "choice" ? choiceMark(p.answer) : p.answer?.trim() || trySolve(p.question)?.answer;
                          return (
                            <button
                              type="button"
                              onClick={() => setAnswerEdit({ assignmentId: a.id, problemId: p.id, value: p.answer ?? "" })}
                              title="정답 고치기"
                              className={`ml-auto shrink-0 self-start rounded-full px-2 py-0.5 text-xs leading-5 hover:ring-1 hover:ring-line ${
                                ans ? "bg-sage-soft text-[#5d7a50]" : "bg-sand text-muted"
                              }`}
                            >
                              {ans ? `정답 ${ans}` : "정답 없음"} ✎
                            </button>
                          );
                        })()
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {scheduling?.id === a.id && (
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await update(a.id, { dueAt: fromLocalInput(scheduling.value), ...(a.closedAt ? { closed: false } : {}) })) setScheduling(null);
                  }}
                >
                  <DateTimePicker
                    value={scheduling.value}
                    min={toLocalInput(now)}
                    onChange={(v) => setScheduling({ id: a.id, value: v })}
                    className="py-1.5 text-sm"
                  />
                  <button type="submit" className="rounded-full bg-sage px-3 py-1.5 text-xs text-white">예약</button>
                  {a.dueAt && a.dueAt > now && (
                    <button
                      type="button"
                      onClick={async () => (await update(a.id, { dueAt: null })) && setScheduling(null)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-muted"
                    >
                      예약 해제
                    </button>
                  )}
                  <button type="button" onClick={() => setScheduling(null)} className="text-xs text-muted underline">
                    취소
                  </button>
                </form>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {!a.published ? (
                  <button onClick={() => update(a.id, { published: true })} className="rounded-full bg-sage px-3 py-1.5 text-white">
                    학생에게 공개
                  </button>
                ) : statusOf(a, now) === "closed" ? (
                  <button onClick={() => update(a.id, { closed: false })} className="rounded-full bg-sage px-3 py-1.5 text-white">
                    다시 열기
                  </button>
                ) : (
                  <button
                    onClick={() => confirm(`'${a.title}'을(를) 지금 마감할까요? 학생들이 더 이상 제출할 수 없어요.`) && update(a.id, { closed: true })}
                    className="rounded-full bg-[#b5624f] px-3 py-1.5 text-white"
                  >
                    지금 마감
                  </button>
                )}
                {statusOf(a, now) !== "closed" && (
                  <button
                    onClick={() => setScheduling({ id: a.id, value: a.dueAt && a.dueAt > now ? toLocalInput(a.dueAt) : plusHours(24) })}
                    className="rounded-full border border-honey px-3 py-1.5 text-olive hover:bg-honey-soft"
                  >
                    {a.dueAt ? "마감 변경" : "마감 예약"}
                  </button>
                )}
                {/* 자주 안 쓰는 동작은 접어 둔다 */}
                {((a.published && statusOf(a, now) !== "closed") || list.length > 1) && (
                  <details className="relative">
                    <summary className="grid h-7 w-9 cursor-pointer list-none place-items-center rounded-full border border-line text-muted hover:bg-sand [&::-webkit-details-marker]:hidden">
                      ⋯
                    </summary>
                    <div className="absolute left-0 top-full z-20 mt-1 flex min-w-28 flex-col rounded-2xl border border-line bg-[#fffdf8]/[0.97] p-1 shadow-lg">
                      {a.published && statusOf(a, now) !== "closed" && (
                        <button onClick={() => update(a.id, { published: false })} className="rounded-xl px-3 py-2 text-left text-muted hover:bg-sand">
                          비공개로
                        </button>
                      )}
                      {list.length > 1 && (
                        <button
                          onClick={async () => {
                            const r = await fetch(`/api/assignments/${a.id}`).then((res) => res.json()).catch(() => null);
                            const n = typeof r?.submissions === "number" ? r.submissions : null;
                            const msg =
                              n === null
                                ? "이 과제를 지울까요?\n학생이 제출한 풀이도 함께 지워지고, 되돌릴 수 없어요."
                                : n > 0
                                  ? `이 과제를 지울까요?\n학생이 제출한 풀이 ${n}개도 함께 지워지고, 되돌릴 수 없어요.\n(학생에게 숨기기만 하려면 '비공개로'를 써 주세요.)`
                                  : "이 과제를 지울까요? 아직 제출한 풀이는 없어요.";
                            if (confirm(msg)) update(a.id, {}, "DELETE");
                          }}
                          className="rounded-xl px-3 py-2 text-left text-[#b5624f] hover:bg-salmon-soft"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

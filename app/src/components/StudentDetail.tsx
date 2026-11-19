"use client";
import FigureView from "@/components/FigureView";
import QuestionText from "@/components/QuestionText";

import { useCallback, useEffect, useRef, useState } from "react";
import AiSummary from "@/components/AiSummary";
import ConceptUnderstanding from "@/components/ConceptUnderstanding";
import LearningProfileCard from "@/components/LearningProfileCard";
import MessageThread from "@/components/MessageThread";
import SupplementPanel from "@/components/SupplementPanel";
import { useLiveRefresh } from "@/components/useLiveRefresh";
import { solveLinear } from "@/lib/equation";
import { getProblem } from "@/lib/problems";
import { correctOf } from "@/lib/verdict";
import { ERROR_LABEL, LOW_OCR_CONFIDENCE, handwritingIssue, hasHandwritingIssue, inkStats, type ClassStats, type ErrorType, type StudentStats, type Submission } from "@/lib/types";

// 학생 상세: 개념별 이해도 → AI 요약(짧게) → 탭 [풀이 기록 | 보충 지도]
// 오늘의 교실 오른쪽 패널과 학생 상세 페이지에서 같이 쓴다.
//  - stats 를 넘기면 그 지표를, 없으면 실제 제출 지표를 직접 불러온다
//  - start: 처음 열 탭·풀이 필터 (예: 표의 '확인 n' 배지 → 풀이 기록 · 확인 필요)
//  - 풀이는 학년도·반별로 묶는다. 지금 담당 반 학생이면 지난 학년 기록까지 보이고, 지난 기록은 읽기 전용
type History = { student: { id: string; name: string }; access: "current" | "past"; classId?: string | null; submissions: Submission[] };
export type DetailTab = "subs" | "supplement" | "messages";
export type SubFilter = "all" | "wrong" | "review";
const fmtSec = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`);

export default function StudentDetail({
  id,
  stats,
  onClose,
  start,
  only,
}: {
  id: string;
  stats?: StudentStats;
  onClose?: () => void;
  start?: { tab?: DetailTab; filter?: SubFilter };
  only?: { title: string; problemIds: string[] }; // 오늘의 교실에서 과제를 골랐으면 풀이 기록을 그 과제 문항만
}) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [info, setInfo] = useState<Omit<History, "submissions"> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fetched, setFetched] = useState<StudentStats | undefined>();
  const [openSupplement, setOpenSupplement] = useState(0);
  const [tab, setTab] = useState<DetailTab>(start?.tab && start.tab !== "messages" ? start.tab : "subs");
  // 메시지는 탭 아래가 아니라 이름 바로 밑에 연다 (스크롤 없이 바로 읽고 답장)
  const [showMessages, setShowMessages] = useState(start?.tab === "messages");
  const student = stats ?? fetched;
  // 풀이 필터를 정해서 열었으면 (표의 '확인 n' 배지) 풀이 기록이 보이게 내려 준다
  const tabsRef = useRef<HTMLDivElement>(null);
  const jumped = useRef(!start?.filter);

  // 지표를 받지 않았으면 (학생 상세 페이지로 바로 들어옴) 이 학생 반의 지표를 불러온다.
  //  반을 정하지 않으면 서버가 선생님의 첫 반을 골라, 다른 반 학생은 지표가 비어 보였다
  const classId = info?.classId;
  useEffect(() => {
    if (stats || !classId) return;
    fetch(`/api/class-stats?class=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((d: ClassStats) => setFetched(d.students?.find((s) => s.id === id)))
      .catch(() => {});
  }, [id, stats, classId, subs.length]);

  const load = useCallback(
    () =>
      fetch(`/api/submissions?studentId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((d: History | { error: string }) => {
          if ("error" in d) return setLoadError(d.error);
          setSubs(d.submissions);
          setInfo({ student: d.student, access: d.access, classId: d.classId });
          setLoadError("");
        })
        .catch(() => {}),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  // 이 학생의 풀이가 바뀌면 (제출·분석 완료·확인) 바로 다시 불러온다 (설정이 없으면 4초 폴링)
  useLiveRefresh(`student:${id}`, load);

  const name = student?.name ?? info?.student.name;
  const current = info?.access === "current";
  const [showAll, setShowAll] = useState(false);
  const limit = only && !showAll ? new Set(only.problemIds) : null;
  const shownSubs = limit ? subs.filter((x) => limit.has(x.problemId)) : subs;
  const groups = groupByOrigin(shownSubs);
  // 지난 학년 학생은 보충 지도 대신 풀이 기록
  const activeTab: DetailTab = current ? tab : "subs";
  useEffect(() => {
    if (jumped.current || !subs.length) return;
    jumped.current = true;
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [subs.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">{name ?? "…"}</h1>
        {student && (
          <span className="text-sm text-muted">
            정답률 <b className="text-ink">{student.accuracy === null ? "-" : `${student.accuracy}%`}</b>
            {" · "}제출 <b className="text-ink">{student.submitted}/{student.total}</b>
            {student.assignmentsTotal !== undefined && (
              <>
                {" · "}다 낸 과제 <b className="text-ink">{student.assignmentsDone}/{student.assignmentsTotal}</b>
              </>
            )}
            {student.avgSec !== null && <> · 평균 {fmtSec(student.avgSec)}</>}
          </span>
        )}
        <button
          onClick={() => setShowMessages((v) => !v)}
          aria-expanded={showMessages}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${
            showMessages ? "border-honey bg-honey font-semibold text-ink" : "border-line hover:bg-sand"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          {showMessages ? "메시지 닫기" : "메시지"}
        </button>
        {onClose && (
          <button onClick={onClose} aria-label="닫기" className=" grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-sand">
            ✕
          </button>
        )}
      </div>

      {showMessages && (
        <MessageThread
          studentId={id}
          studentName={name ?? "학생"}
          // 개념 영상 찾기: 많이 틀린 개념 · 반복 오류 유형
          concepts={[student?.weakConcept ?? "", student?.repeatedError ? ERROR_LABEL[student.repeatedError] : ""]}
        />
      )}

      {loadError && <div className="rounded-2xl bg-salmon-soft px-4 py-2.5 text-sm text-[#b5624f]">{loadError}</div>}
      {info?.access === "past" && (
        <div className="rounded-2xl border border-line bg-sand px-4 py-2.5 text-sm text-muted">
          지금은 선생님 반 학생이 아니에요. 선생님 반이었던 시절의 기록만 읽기 전용으로 보여요.
        </div>
      )}
      {/* 메시지를 보는 동안에는 대화만 (학습 기록은 메시지 닫기로 돌아온다) */}
      {!showMessages && (
        <>
        <ConceptUnderstanding concepts={student?.conceptHistory ?? []} />
        {current && (
          <AiSummary
            studentId={id}
            refreshKey={subs.length}
            onMakeSupplement={() => {
              setTab("supplement");
              setOpenSupplement((n) => n + 1);
            }}
          />
        )}
        <div ref={tabsRef} className="flex scroll-mt-4 flex-wrap gap-1.5 border-b border-line pb-2" role="tablist">
          {(
            [
              ["subs", "풀이 기록", shownSubs.length],
              ...(current ? [["supplement", "보충 지도", 0]] : []),
            ] as [DetailTab, string, number][]
          ).map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={activeTab === k}
              onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 text-sm ${activeTab === k ? "bg-honey font-semibold text-ink" : "text-muted hover:bg-sand"}`}
            >
              {label}
              {n > 0 && <span className="ml-1 text-xs opacity-70">{n}</span>}
            </button>
          ))}
        </div>

        {activeTab === "supplement" && current && (
          <div className="flex flex-col gap-4">
            <LearningProfileCard studentId={id} refreshKey={subs.length} />
            <SupplementPanel studentId={id} openSignal={openSupplement} />
          </div>
        )}

        {activeTab === "subs" && only && (
          <p className="-mb-1 flex flex-wrap items-center gap-2 rounded-xl bg-honey-soft/60 px-3 py-2 text-sm">
            {showAll ? "모든 과제의 풀이를 보고 있어요." : <>&lsquo;{only.title}&rsquo; 풀이만 보고 있어요.</>}
            <button onClick={() => setShowAll((v) => !v)} className="ml-auto text-xs text-muted underline-offset-2 hover:underline">
              {showAll ? "고른 과제만 보기" : "전체 과제 보기"}
            </button>
          </p>
        )}
        {activeTab === "subs" && (
          <SubmissionList
            key={showAll ? "all" : "only"}
            groups={groups}
            empty={shownSubs.length === 0}
            initialFilter={start?.filter}
            onUpdate={(n) => setSubs((l) => l.map((x) => (x.id === n.id ? n : x)))}
          />
        )}
        </>
      )}
    </div>
  );
}

// 정답·오답·보류 색: 한눈에 구별되게 진한 바탕 (정답 초록·오답 빨강은 흰 글씨 대비 4.5:1 이상, 보류는 노랑에 검정 글씨)
const RESULT_TONE = {
  ok: "border-sage bg-sage text-white",
  wrong: "border-[#b9503a] bg-[#b9503a] text-white",
  hold: "border-honey-deep bg-honey text-ink",
};

// 풀이 기록: 항목(개념)별 맞음·틀림 수 → 항목을 누르면 그 문제 목록 → 문제를 누르면 원본·인식·AI 분석·선생님 확인이 펼쳐진다
type Filter = SubFilter;
const resultOf = (s: Submission) =>
  s.status === "pending"
    ? { label: "분석 중", cls: RESULT_TONE.hold }
    : correctOf(s) === true
      ? { label: "정답", cls: RESULT_TONE.ok }
      : correctOf(s) === false
        ? { label: "오답", cls: RESULT_TONE.wrong }
        : { label: "판정 보류", cls: RESULT_TONE.hold };

function SubmissionList({
  groups,
  empty,
  initialFilter = "all",
  onUpdate,
}: {
  groups: ReturnType<typeof groupByOrigin>;
  empty: boolean;
  initialFilter?: Filter;
  onUpdate: (s: Submission) => void;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [open, setOpen] = useState<string | null>(null);
  const [toggled, setToggled] = useState<Set<string>>(new Set()); // 펼침 기본값(필터에 따라)에서 바꾼 항목
  const match = (s: Submission) =>
    filter === "all" ? true : filter === "wrong" ? correctOf(s) === false : s.status === "needs_review" && !s.teacher?.confirmedAt;
  const all = groups.flatMap((g) => g.items);
  const count = (f: Filter) => all.filter((s) => (f === "all" ? true : f === "wrong" ? correctOf(s) === false : s.status === "needs_review" && !s.teacher?.confirmedAt)).length;

  if (empty) return <div className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">아직 제출한 풀이가 없어요.</div>;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "전체"],
            ["wrong", "틀린 풀이"],
            ["review", "확인 필요"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setFilter(k);
              setToggled(new Set());
            }}
            className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-honey bg-honey-soft font-semibold" : "border-line text-muted hover:bg-sand"}`}
          >
            {label} {count(k)}
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const concepts = byConcept(g.items.filter(match));
        if (!concepts.length) return null;
        return (
          <div key={g.key} className="flex flex-col gap-1.5">
            {groups.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pb-0.5 text-sm">
                <b>{g.title}</b>
                {g.teachers && <span className="text-muted">· {g.teachers}</span>}
                <span className="text-xs text-muted">{g.items.filter(match).length}개</span>
                {g.readOnly && <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">지난 기록 · 읽기 전용</span>}
              </div>
            )}
            {concepts.map((c) => {
              const key = `${g.key}:${c.name}`;
              // 틀린 풀이·확인 필요로 걸러 보는 중이면 처음부터 펼쳐 둔다
              const isOpen = toggled.has(key) !== (filter !== "all");
              const correct = c.items.filter((x) => correctOf(x) === true).length;
              const wrong = c.items.filter((x) => correctOf(x) === false).length;
              const rest = c.items.length - correct - wrong;
              const review = c.items.filter((x) => x.status === "needs_review" && !x.teacher?.confirmedAt).length;
              // 번호 칸: 오래된 풀이부터 1번
              const asc = [...c.items].sort((a, b) => a.submittedAt - b.submittedAt);
              const openIdx = asc.findIndex((x) => x.id === open);
              return (
                <div key={key} className={`rounded-2xl border ${isOpen ? "border-honey" : "border-line"} bg-paper`}>
                  <button
                    onClick={() => setToggled((t) => {
                      const n = new Set(t);
                      if (n.has(key)) n.delete(key);
                      else n.add(key);
                      return n;
                    })}
                    aria-expanded={isOpen}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-cream/60"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-sage-soft px-2 py-0.5 font-semibold text-[#5d7a50]">맞음 {correct}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${wrong ? "bg-salmon-soft text-[#b5624f]" : "bg-sand text-muted"}`}>틀림 {wrong}</span>
                      {rest > 0 && <span className="rounded-full bg-sand px-2 py-0.5 text-muted">기타 {rest}</span>}
                      {review > 0 && <span className="rounded-full bg-honey px-2 py-0.5 text-ink">확인 {review}</span>}
                    </span>
                    {/* 맞음·틀림 비율 막대 */}
                    <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-sand" aria-hidden>
                      <span className="bg-sage" style={{ width: `${(correct / c.items.length) * 100}%` }} />
                      <span className="bg-[#b9503a]" style={{ width: `${(wrong / c.items.length) * 100}%` }} />
                    </span>
                    <span className="text-xs text-muted">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-line p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {asc.map((x, i) => {
                          const r = resultOf(x);
                          const needs = x.status === "needs_review" && !x.teacher?.confirmedAt;
                          const tone =
                            correctOf(x) === true && x.status !== "pending"
                              ? RESULT_TONE.ok
                              : correctOf(x) === false && x.status !== "pending"
                                ? RESULT_TONE.wrong
                                : RESULT_TONE.hold;
                          return (
                            <button
                              key={x.id}
                              onClick={() => setOpen(open === x.id ? null : x.id)}
                              aria-pressed={open === x.id}
                              title={`${i + 1}번 · ${r.label} · ${x.question ?? getProblem(x.problemId)?.question ?? ""}${needs ? " · 확인 필요" : ""}`}
                              className={`relative grid h-8 min-w-8 place-items-center rounded-lg border px-1.5 text-xs font-semibold tabular-nums transition hover:brightness-95 ${tone} ${open === x.id ? "ring-2 ring-honey-deep ring-offset-2 ring-offset-paper" : ""}`}
                            >
                              {i + 1}
                              {needs && <span aria-label="확인 필요" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-paper bg-[#b07800]" />}
                            </button>
                          );
                        })}
                      </div>
                      {openIdx >= 0 &&
                        (() => {
                          const x = asc[openIdx];
                          const r = resultOf(x);
                          const err = x.teacher?.errorType ?? x.analysis?.errorType;
                          return (
                            <div className="mt-3 rounded-xl border border-honey bg-paper">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-sm">
                                <b className="tabular-nums">{openIdx + 1}번</b>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.cls}`}>{r.label}</span>
                                <span className="min-w-0 flex-1 truncate">
                                  <QuestionText text={x.question ?? getProblem(x.problemId)?.question ?? ""} />
                                </span>
                                {correctOf(x) === false && err && err !== "NONE" && <span className="text-xs text-[#b5624f]">{ERROR_LABEL[err]}</span>}
                                {hasHandwritingIssue(x) && (
                                  <span className="rounded-full bg-honey-soft px-2 py-0.5 text-xs text-olive" title="OCR·AI 모두 이 풀이를 제대로 읽지 못했어요. 원본 풀이와 비교해 주세요.">
                                    ✎ 글씨체
                                  </span>
                                )}
                                {x.teacher?.confirmedAt ? (
                                  <span className="text-xs text-[#5d7a50]">✓ 확인함</span>
                                ) : x.status === "needs_review" ? (
                                  <span className="rounded-full bg-honey px-2 py-0.5 text-xs text-ink">확인 필요</span>
                                ) : null}
                                <span className="text-xs text-muted">
                                  {new Date(x.submittedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <button onClick={() => setOpen(null)} aria-label="닫기" className="text-xs text-muted hover:text-ink">
                                  ✕
                                </button>
                              </div>
                              <div className="p-3">
                                <SubmissionCard key={x.id} s={x} onUpdate={onUpdate} />
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {all.filter(match).length === 0 && <p className="text-sm text-muted">해당하는 풀이가 없어요.</p>}
    </section>
  );
}

// 풀이를 항목(개념)별로 묶는다 (최근에 푼 항목 먼저, 항목 안은 최근 풀이 먼저)
function byConcept(subs: Submission[]) {
  const map = new Map<string, Submission[]>();
  for (const s of subs) {
    const name = s.concept ?? getProblem(s.problemId)?.concept ?? "기타";
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(s);
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => b.submittedAt - a.submittedAt) }))
    .sort((a, b) => b.items[0].submittedAt - a.items[0].submittedAt);
}

// 풀이를 학년도·반별로 묶는다 (최근 학년도 먼저, 반 정보 없는 예전 풀이는 맨 뒤)
function groupByOrigin(subs: Submission[]) {
  const map = new Map<string, { key: string; title: string; teachers: string; year: number; readOnly: boolean; items: Submission[] }>();
  for (const s of subs) {
    const o = s.origin;
    const key = o?.classId ?? "-";
    if (!map.has(key))
      map.set(key, {
        key,
        title: o ? `${o.schoolYear}학년도 ${o.className}` : "예전 기본 과제",
        teachers: o?.teachers ?? "",
        year: o?.schoolYear ?? 0,
        readOnly: true,
        items: [],
      });
    const g = map.get(key)!;
    g.items.push(s);
    g.readOnly &&= Boolean(s.readOnly);
  }
  return [...map.values()].sort((a, b) => b.year - a.year);
}

// 정답: 선생님이 정한 문항 정답 → 기본 시연 문항 정답 → 풀이기로 푼 정답 (안 풀리면 없음)
function answerOf(s: Submission) {
  if (s.problemAnswer?.trim()) return s.problemAnswer.trim();
  const p = getProblem(s.problemId);
  if (p?.answer) return p.answer;
  try {
    return s.question ? solveLinear(s.question).answer : "";
  } catch {
    return "";
  }
}

// 학생 답: 답안 칸에 쓴 답이 먼저 (맞음·틀림은 제출할 때 서버가 정답과 비교한 값, 학생 화면과 같은 기준).
//  답안 칸이 비었으면 풀이 끝에서 AI 가 읽은 답과 AI 채점.
//  둘 다 있는데 다르면 풀이 끝 답도 같이 보여 준다 (풀이에서 구한 값과 다른 답을 옮겨 쓰는 실수를 놓치지 않게)
const sameAnswer = (x: string, y: string) => x.replace(/\s/g, "").toLowerCase() === y.replace(/\s/g, "").toLowerCase();
function studentAnswerOf(s: Submission) {
  const fromLines = s.analysis?.recognizedAnswer ?? null;
  if (s.answerText)
    return { text: s.answerText, correct: s.answerCorrect ?? s.analysis?.correct ?? null, note: fromLines && !sameAnswer(fromLines, s.answerText) ? `풀이 끝에 쓴 답: ${fromLines}` : null };
  return { text: fromLines, correct: s.analysis?.correct ?? null, note: fromLines ? "답안 칸이 비어 풀이 끝에서 읽었어요" : null };
}

// 제출하고 5분이 지났는데 아직 '분석 중': 멈춘 것으로 보고 '↻ 다시' 를 보여 준다 (보통 10~20초면 끝남)
const stalePending = (s: Submission) => s.status === "pending" && Date.now() - s.submittedAt > 5 * 60 * 1000;

const STATUS: Record<Submission["status"], { label: string; cls: string }> = {
  pending: { label: "분석 중", cls: "bg-honey-soft text-olive" },
  done: { label: "분석 완료", cls: "bg-sage-soft text-[#5d7a50]" },
  needs_review: { label: "확인 필요", cls: "bg-honey text-ink" },
  error: { label: "오류", cls: "bg-sand text-ink" },
};

// onSaved: 저장이 끝난 뒤 (확인할 풀이 모음에서 '저장 후 다음'으로 넘어갈 때), saveLabel: 저장 버튼 글자
export function SubmissionCard({
  s,
  onUpdate,
  onSaved,
  saveLabel,
}: {
  s: Submission;
  onUpdate: (s: Submission) => void;
  onSaved?: () => void;
  saveLabel?: string;
}) {
  const problem = getProblem(s.problemId);
  const stats = inkStats(s);
  const a = s.analysis;
  const ans = studentAnswerOf(s);
  const [memo, setMemo] = useState(s.teacher?.memo ?? "");
  // 오류 유형: 선생님이 정한 것 → AI 판정. 둘 다 없으면 (분석 중·분석 실패) 비워 둔다 ("오류 없음"으로 정해 두면 그대로 저장했을 때 오답이 정답으로 바뀜)
  const savedErrorType: ErrorType | "" = s.teacher?.errorType ?? a?.errorType ?? "";
  const [errorType, setErrorType] = useState<ErrorType | "">(savedErrorType);
  const [touched, setTouched] = useState(false);
  // 카드를 연 뒤에 분석이 끝나면, 선생님이 아직 고르지 않았으면 AI 유형으로 맞춘다
  useEffect(() => {
    if (!touched) setErrorType(savedErrorType);
  }, [savedErrorType, touched]);

  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = memo !== (s.teacher?.memo ?? "") || errorType !== savedErrorType;
  const confirmed = Boolean(s.teacher?.confirmedAt);
  const [imageMissing, setImageMissing] = useState(false);

  const save = async () => {
    setSaving("saving");
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 유형을 고르지 않았으면 메모만 (유형은 AI 판정 그대로)
        body: JSON.stringify({ memo, ...(errorType ? { errorType } : {}) }),
      });
      if (!res.ok) throw new Error();
      onUpdate(await res.json());
      setTouched(false);
      setSaving("saved");
      onSaved?.();
      setTimeout(() => setSaving("idle"), 2500);
    } catch {
      setSaving("error");
    }
  };

  return (
    // 넓은 칸에서만 좌우 2단 (오른쪽 패널처럼 좁은 곳에서는 위아래로)
    <div className="@container">
    <div className="grid gap-4 @2xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <QuestionText text={s.question ?? problem?.question ?? ""} className="min-w-0 flex-1 font-semibold" />
          {confirmed && s.status !== "pending" ? (
            <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-sage px-2 py-0.5 text-xs text-white">✓ 확인함</span>
          ) : (
            <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
          )}
          {(s.status !== "pending" || stalePending(s)) && !s.readOnly && (
            <button
              onClick={async () => {
                await fetch(`/api/submissions/${s.id}/reanalyze`, { method: "POST" });
                onUpdate({ ...s, status: "pending", analysis: undefined, ocrLines: [] });
              }}
              className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-sand"
            >
              ↻ 다시
            </button>
          )}
        </div>
        {problem?.figure && <FigureView figure={problem.figure} />}
        {/* 정답 · 학생 답 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-sage/40 bg-sage-soft px-3 py-2">
            <div className="text-xs text-muted">정답</div>
            <div className="break-words text-lg font-bold text-[#5d7a50]">{answerOf(s) || "없음"}</div>
          </div>
          <div
            className={`rounded-xl border px-3 py-2 ${
              ans.correct === true ? "border-sage/40 bg-sage-soft" : ans.correct === false ? "border-[#b5624f]/30 bg-salmon-soft" : "border-line bg-sand"
            }`}
          >
            <div className="text-xs text-muted">
              학생 답{ans.correct === true ? " · 맞음" : ans.correct === false ? " · 틀림" : ""}
            </div>
            <div className={`break-words text-lg font-bold ${ans.correct === true ? "text-[#5d7a50]" : ans.correct === false ? "text-[#b5624f]" : "text-ink"}`}>
              {ans.text ?? (s.status === "pending" ? "인식 중" : "-")}
            </div>
            {ans.note && <div className="mt-0.5 text-xs text-muted">{ans.note}</div>}
          </div>
        </div>
        {imageMissing ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">원본 풀이 이미지가 없어요.</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/submissions/${s.id}/image`}
            alt="원본 풀이"
            onError={() => setImageMissing(true)}
            className="rounded-xl border border-line"
          />
        )}
        {s.hasScratch && (
          <details className="rounded-xl border border-line px-3 py-2 text-xs">
            <summary className="cursor-pointer text-muted">연습장 보기 (그림·계산, AI 채점 안 함)</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/submissions/${s.id}/scratch`} alt="연습장" loading="lazy" className="mt-2 rounded-lg border border-line bg-white" />
          </details>
        )}
        <div className="text-xs text-muted">
          {stats.durationSec}초 · 지움 {stats.erases}회
          {stats.idleSec > 0 && ` · 멈춤 ${stats.idleSec}초`}
          {stats.hiddenCount > 0 && ` · 화면 이탈 ${stats.hiddenCount}회`}
        </div>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">인식된 식</div>
          {hasHandwritingIssue(s) && (
            <p className="mb-1.5 rounded-lg bg-honey-soft/60 px-2.5 py-1.5 text-xs text-olive">
              ✎ 글씨체 문제:{" "}
              {handwritingIssue(s).nothingRead ? "OCR이 이 풀이를 하나도 읽지 못했어요." : `OCR이 ${handwritingIssue(s).lines.length}줄을 이상하게 읽었어요.`} 원본과 비교해 주시고, 문자·숫자·부호를 또박또박 쓰도록 지도해 주세요.
            </p>
          )}
          <ol className="flex flex-col gap-0.5 rounded-xl bg-sand p-3 font-mono">
            {s.ocrLines.length === 0 && <li className="text-muted">{s.status === "pending" ? "인식 중…" : "인식된 내용 없음"}</li>}
            {s.ocrLines.map((raw, i) => {
              const fixed = a?.correctedLines?.[i] ?? raw;
              const changed = fixed.replace(/\s/g, "") !== raw.replace(/\s/g, "");
              const isErr = a?.firstErrorLine === i;
              const unsure = (s.ocrConfidence?.[i] ?? 1) < LOW_OCR_CONFIDENCE;
              return (
                <li key={i} className={`rounded px-2 py-1 ${isErr ? "bg-salmon-soft text-[#b5624f]" : ""}`}>
                  {fixed} {isErr && "← 오류 의심"}
                  {unsure && (
                    <span className="ml-2 rounded-full bg-paper px-2 py-0.5 font-sans text-xs text-olive" title="OCR이 확신하지 못한 줄이에요. 원본 풀이와 비교해 주세요.">
                      인식 불확실
                    </span>
                  )}
                  {changed && (
                    <span className="ml-2 cursor-help text-xs text-muted" title={`OCR 원문: ${raw}`}>
                      보정됨
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {s.status === "error" && <div className="rounded-xl bg-sand p-3 text-muted">{s.statusMessage}</div>}

        {a && (
          <div
            className={`flex flex-col gap-2 rounded-xl border p-3 ${
              a.correct === true ? "border-sage/40 bg-sage-soft" : a.correct === false ? "border-[#b5624f]/30 bg-salmon-soft" : "border-transparent bg-honey-soft"
            }`}
          >
            <div className="text-xs font-semibold text-muted">AI 분석</div>
            <div>
              <b className={a.correct === true ? "text-[#5d7a50]" : a.correct === false ? "text-[#b5624f]" : ""}>{a.correct === null ? "판정 보류" : a.correct ? "정답" : "오답"}</b> · {ERROR_LABEL[a.errorType]} · {a.concept}
            </div>
            <div><span className="text-muted">근거</span> {a.reason}</div>
            <div><span className="text-muted">지도 제안</span> {a.suggestion}</div>
          </div>
        )}

        {s.readOnly ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-sand/60 p-3">
            <div className="text-xs font-semibold text-muted">
              선생님 확인{s.origin ? ` (${s.origin.schoolYear}학년도 ${s.origin.className}${s.origin.teachers ? ` · ${s.origin.teachers}` : ""})` : ""}
            </div>
            {s.teacher?.errorType && <div>오류 유형: {ERROR_LABEL[s.teacher.errorType]}</div>}
            <div className={s.teacher?.memo ? "" : "text-muted"}>{s.teacher?.memo || "남긴 메모가 없어요."}</div>
            <div className="text-xs text-muted">지난 기록이라 고칠 수 없어요.</div>
          </div>
        ) : (
          <div className={`flex flex-col gap-2 rounded-xl border p-3 ${confirmed ? "border-sage/50 bg-sage-soft/40" : "border-line"}`}>
            <div className="text-xs font-semibold text-muted">선생님 확인</div>
            <select
              value={errorType}
              onChange={(e) => {
                setErrorType(e.target.value as ErrorType | "");
                setTouched(true);
              }}
              className="rounded-full border border-line bg-paper px-3 py-1.5"
            >
              {!savedErrorType && <option value="">{s.status === "pending" ? "분석 중이에요 · 오류 유형 고르기" : "오류 유형 고르기"}</option>}
              {(Object.keys(ERROR_LABEL) as ErrorType[]).map((k) => (
                <option key={k} value={k}>{ERROR_LABEL[k]}</option>
              ))}
            </select>
            <textarea
              value={memo}
              maxLength={2000}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="학생에게 남길 말 (과제가 마감되면 학생도 봐요)"
              className="min-h-16 rounded-lg border border-line px-3 py-2"
            />
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs ${saving === "error" ? "text-[#b5624f]" : dirty ? "text-olive" : "text-muted"}`}>
                {saving === "error"
                  ? "저장하지 못했어요. 다시 눌러 주세요."
                  : dirty
                    ? "저장 안 됨"
                    : confirmed
                      ? `✓ ${new Date(s.teacher!.confirmedAt!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 확인함`
                      : ""}
              </span>
              <button
                onClick={save}
                disabled={saving === "saving"}
                className={`shrink-0 rounded-full px-4 py-2 font-semibold text-white transition active:scale-95 disabled:opacity-60 ${
                  saving === "saved" ? "bg-[#5d7a50]" : "bg-sage hover:bg-[#4d6842]"
                }`}
              >
                {saving === "saving" ? "저장 중…" : saving === "saved" ? "✓ 저장했어요" : confirmed && !dirty ? "다시 저장" : (saveLabel ?? "확인·저장")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

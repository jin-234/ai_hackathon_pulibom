"use client";
import FigureView from "@/components/FigureView";
import QuestionText from "@/components/QuestionText";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnswerField from "@/components/AnswerField";
import Chick from "@/components/Chick";
import InkCanvas, { INK_COLORS, InkToolPill, type InkCanvasHandle, type InkTool } from "@/components/InkCanvas";
import { ERROR_LABEL, formatDue, type AnalysisStatus, type ErrorType, type Problem, type Stroke } from "@/lib/types";
import LogoutButton from "@/components/LogoutButton";
import { verdictOf as baseVerdict, type Verdict } from "@/lib/verdict";

// 마감된 과제: 내가 낸 마지막 풀이의 채점 결과 (서버에서 마감된 과제일 때만 채워 준다)
export type MyResult = {
  submissionId: string;
  submittedAt: number;
  tries: number; // 이 문항을 낸 횟수 (다시 제출 포함)
  status: AnalysisStatus;
  ai: {
    correct: boolean | null;
    answer: string | null;
    errorType: ErrorType;
    reason: string;
    lines: string[]; // AI가 읽은 내 풀이 줄
    firstErrorLine: number | null; // 처음 틀린 줄 (0부터)
  } | null;
  teacher: { errorType: ErrorType | null; confirmedAt: number; memo: string | null } | null; // 선생님이 확인했을 때만
  answer: string | null; // 정답
  answerText: string | null; // 답안 칸에 쓴 답
  answerCorrect: boolean | null; // 답안 칸 답이 정답과 같은지 (null: 비교할 수 없음)
  solution: string[]; // 단계별 해설
};

// 최종 결과: 선생님이 오류 유형을 정했으면 그것, 아니면 AI 판정 (과제 목록과 같은 기준)
const verdictOf = (r: MyResult | undefined): Verdict => baseVerdict(r && { teacherErrorType: r.teacher?.errorType, aiCorrect: r.ai?.correct });
const VERDICT = {
  ok: { label: "맞았어요", cls: "bg-sage text-white" },
  wrong: { label: "다시 볼 곳이 있어요", cls: "bg-salmon text-white" },
  hold: { label: "채점 중이거나 확인이 필요해요", cls: "bg-sand text-muted" },
  none: { label: "제출하지 않았어요", cls: "border border-line bg-paper text-muted" },
} as const;

export default function StudentApp({
  studentId,
  studentName,
  assignmentTitle,
  problems: PROBLEMS,
  initialDone = {},
  initialStrokes = {},
  initialAnswers = {},
  initialScratch = {},
  closed = false,
  dueAt,
  results,
}: {
  studentId: string;
  studentName: string;
  assignmentTitle: string;
  problems: Problem[];
  initialDone?: Record<string, boolean>;
  initialStrokes?: Record<string, Stroke[]>; // 문항별 마지막으로 낸 풀이의 획 (다시 풀 때 그 위에서 고친다)
  initialAnswers?: Record<string, string>; // 문항별 마지막으로 낸 답안 칸 답
  initialScratch?: Record<string, Stroke[]>; // 문항별 마지막으로 낸 연습장 필기
  closed?: boolean;
  dueAt?: number;
  results?: Record<string, MyResult>;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>(initialDone);
  // 마감된 과제는 결과를 1번부터 본다
  const [idx, setIdx] = useState(() => (results ? 0 : Math.max(0, PROBLEMS.findIndex((p) => !initialDone[p.id]))));
  const [sending, setSending] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const canvas = useRef<InkCanvasHandle>(null); // 정리 풀이 (AI 가 읽는 칸)
  const pad = useRef<InkCanvasHandle>(null); // 연습장 (AI 채점 안 함)
  const activeRef = useRef<"main" | "pad">("main"); // 되돌리기 대상: 마지막으로 펜슬이 닿은 칸
  const [tool, setTool] = useState<InkTool>("pen");
  const [color, setColor] = useState(INK_COLORS[0]);
  const [thick, setThick] = useState(false);
  const scratchRef = useRef<Record<string, Stroke[]>>({ ...initialScratch });
  // 칸 배치: 그림 문제(또는 연습장에 쓴 게 있으면)는 연습장 + 정리 풀이 두 칸, 아니면 정리 풀이 한 칸. 학생이 바꿀 수도 있다
  const [twoPaneOf, setTwoPaneOf] = useState<Record<string, boolean>>({});
  // 문항별 풀이: 마지막으로 낸 풀이로 시작하고, 다른 문항으로 넘어갈 때 쓰던 풀이도 여기에 남겨 둔다
  const inkRef = useRef<Record<string, Stroke[]>>({ ...initialStrokes });
  const problem = PROBLEMS[idx];
  // 답안 칸: 문항별로 기억하고, 이 기기에 자동 저장 (제출하면 지운다)
  const ansRef = useRef<Record<string, string>>({ ...initialAnswers });
  const [answer, setAnswer] = useState(() => ansRef.current[problem.id] ?? "");
  const answerKey = (problemId: string) => `pulibom:draft-answer:${studentId}:${problemId}`;
  const scratchKey = (problemId: string) => `pulibom:draft-scratch:${studentId}:${problemId}`;
  const twoPane = twoPaneOf[problem.id] ?? Boolean(problem.figure || scratchRef.current[problem.id]?.length);
  const figure = problem.figure;
  // 자동 저장: 쓰는 중인 풀이를 이 기기에 저장해서, 앱을 껐다 켜도 이어서 쓸 수 있게 (제출하면 지운다)
  const draftKey = (problemId: string) => `pulibom:draft:${studentId}:${problemId}`;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  useEffect(() => {
    if (results || closed) return;
    for (const p of PROBLEMS) {
      try {
        const raw = localStorage.getItem(draftKey(p.id));
        if (raw) inkRef.current[p.id] = JSON.parse(raw) as Stroke[];
        const ans = localStorage.getItem(answerKey(p.id));
        if (ans !== null) ansRef.current[p.id] = ans;
        const sc = localStorage.getItem(scratchKey(p.id));
        if (sc) scratchRef.current[p.id] = JSON.parse(sc) as Stroke[];
      } catch {}
    }
    canvas.current?.reset(inkRef.current[PROBLEMS[idx].id]);
    pad.current?.reset(scratchRef.current[PROBLEMS[idx].id]);
    setAnswer(ansRef.current[PROBLEMS[idx].id] ?? "");
    setDraftsLoaded(true);
    // 처음 한 번만 (이후엔 문항을 옮길 때 inkRef 로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveDraft = (strokes: Stroke[]) => {
    inkRef.current[problem.id] = strokes;
    try {
      localStorage.setItem(draftKey(problem.id), JSON.stringify(strokes));
      setSavedAt(Date.now());
    } catch {}
  };
  const saveScratch = (strokes: Stroke[]) => {
    scratchRef.current[problem.id] = strokes;
    try {
      localStorage.setItem(scratchKey(problem.id), JSON.stringify(strokes));
      setSavedAt(Date.now());
    } catch {}
  };
  const saveAnswer = (v: string) => {
    setAnswer(v);
    ansRef.current[problem.id] = v;
    try {
      localStorage.setItem(answerKey(problem.id), v);
      setSavedAt(Date.now());
    } catch {}
  };

  // 화면이 준비됨: 아이패드 앱이 Next 라우터로 화면을 옮겨도 된다 (준비 전에 부르면 오류)
  useEffect(() => {
    (window as unknown as { __pulibomReady?: boolean }).__pulibomReady = true;
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const goto = (i: number) => {
    const cur = canvas.current?.getStrokes();
    if (cur) inkRef.current[problem.id] = cur;
    const sc = pad.current?.getStrokes();
    if (sc) scratchRef.current[problem.id] = sc;
    ansRef.current[problem.id] = answer;
    setIdx(i);
    canvas.current?.reset(inkRef.current[PROBLEMS[i].id]);
    pad.current?.reset(scratchRef.current[PROBLEMS[i].id]);
    setAnswer(ansRef.current[PROBLEMS[i].id] ?? "");
    setStartedAt(Date.now());
  };

  const nextUnsolved = (from: number) => {
    for (let k = 1; k <= PROBLEMS.length; k++) {
      const i = (from + k) % PROBLEMS.length;
      if (!done[PROBLEMS[i].id] && i !== from) return i;
    }
    return null;
  };

  const submit = async () => {
    const data = canvas.current?.getData();
    if (!data) return;
    if (data.strokes.length === 0 && !confirm("정리 풀이 칸이 비어 있어요. 그래도 제출할까요?")) return;
    const sc = pad.current?.getData();
    const scratch = sc?.strokes.length ? { strokes: sc.strokes, imageDataUrl: sc.imageDataUrl } : undefined;
    const answerText = answer.trim();
    if (!answerText && !confirm("답안 칸이 비어 있어요. 그래도 제출할까요?")) return;
    setSending(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, startedAt, submittedAt: Date.now(), ...data, answerText, scratch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "제출하지 못했어요.");
      setDone((d) => ({ ...d, [problem.id]: true }));
      inkRef.current[problem.id] = data.strokes;
      ansRef.current[problem.id] = answerText;
      scratchRef.current[problem.id] = sc?.strokes ?? [];
      try {
        localStorage.removeItem(draftKey(problem.id));
        localStorage.removeItem(answerKey(problem.id));
        localStorage.removeItem(scratchKey(problem.id));
      } catch {}
      const n = nextUnsolved(idx);
      if (n !== null) goto(n);
      else setCelebrate(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // 다 끝내면 축하 화면을 잠깐 보여 주고 과제 목록으로
  const backToList = () => {
    router.push("/student");
    router.refresh();
  };
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(backToList, 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  // 손가락으로 옆으로 밀면 문항 넘기기 (왼쪽 → 다음, 오른쪽 → 이전). 펜슬·위아래 밀기는 그대로
  // 미는 동안 화면이 손가락을 따라 움직이고, 놓으면 다음 문항이 옆에서 미끄러져 들어온다
  const swipeRef = useRef<{ id: number; x: number; y: number; locked: boolean } | null>(null);
  const [slide, setSlide] = useState({ x: 0, anim: false });
  const swipeTarget = (dx: number) => {
    const next = idx + (dx < 0 ? 1 : -1);
    return next >= 0 && next < PROBLEMS.length ? next : null;
  };
  const touchesRef = useRef(0); // 화면에 닿은 손가락 수 (두 손가락이면 확대라서 넘기지 않는다)
  const onSwipeStart = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current += 1;
    if (touchesRef.current > 1) {
      if (swipeRef.current) setSlide({ x: 0, anim: true });
      swipeRef.current = null;
      return;
    }
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: false };
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const st = swipeRef.current;
    if (!st || st.id !== e.pointerId) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.locked) {
      if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) return void (swipeRef.current = null); // 위아래 밀기
      if (Math.abs(dx) < 12) return;
      st.locked = true;
    }
    // 넘길 문항이 없으면 살짝만 끌린다
    setSlide({ x: swipeTarget(dx) === null ? dx * 0.25 : dx, anim: false });
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") touchesRef.current = Math.max(0, touchesRef.current - 1);
    const st = swipeRef.current;
    if (!st || st.id !== e.pointerId) return;
    swipeRef.current = null;
    if (!st.locked) return;
    const dx = e.clientX - st.x;
    const next = swipeTarget(dx);
    if (e.type !== "pointerup" || Math.abs(dx) < 80 || next === null) return setSlide({ x: 0, anim: true });
    const w = window.innerWidth;
    setSlide({ x: dx < 0 ? -w : w, anim: true });
    setTimeout(() => {
      goto(next);
      setSlide({ x: dx < 0 ? w * 0.35 : -w * 0.35, anim: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setSlide({ x: 0, anim: true })));
    }, 180);
  };
  const undoActive = () => (activeRef.current === "pad" && twoPane ? pad : canvas).current?.undo();
  const clearAll = () => {
    if (!confirm("이 문항에 쓴 필기를 모두 지울까요?")) return;
    canvas.current?.clear();
    pad.current?.clear();
  };

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    // 화면 높이에 딱 맞춤: 가로는 문제 | 필기 나란히, 세로는 문제(짧게) 위 · 필기 아래로 남은 높이를 채운다
    <div className="flex h-[100dvh] flex-col overflow-x-hidden">
      {celebrate && <Celebration onDone={backToList} />}
      {/* 상단 바: 로고 · 과제 이름 · 자동 저장 · 나. 아이패드 앱에서는 통째로 숨기고 앱 상단 바를 쓴다 (lib/app.ts) */}
      <header data-app-hide className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1.5 text-lg font-extrabold">
            <Chick size={30} />
            풀이봄
          </Link>
          <Link href="/student" className="ml-2 rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-sand">
            ← 과제 목록
          </Link>
        </div>
        <div className="text-sm font-semibold text-ink">
          {assignmentTitle.split(" · ").map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-2 font-normal text-muted">/</span>}
              {part}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          {!results && !closed && <SavedPill at={savedAt} />}
          <span className="grid h-9 w-9 place-items-center rounded-full bg-honey-soft text-sm font-semibold" title={studentName}>
            {studentName[0]}
          </span>
          <LogoutButton />
        </div>
      </header>

      {/* 진행 상황 */}
      <div className="flex items-center gap-4 border-y border-line bg-paper/60 px-6 py-3">
        <span className="shrink-0 text-sm font-semibold text-ink">{results ? "채점 결과" : "오늘의 배움"}</span>
        <div className="flex flex-wrap gap-2.5">
          {PROBLEMS.map((p, i) => {
            const isDone = done[p.id];
            const cur = i === idx;
            if (results) {
              const v = verdictOf(results[p.id]);
              return (
                <button
                  key={p.id}
                  onClick={() => goto(i)}
                  aria-label={`${i + 1}번 문항 · ${VERDICT[v].label}`}
                  className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold transition ${VERDICT[v].cls} ${cur ? "ring-4 ring-honey" : ""}`}
                >
                  {v === "ok" ? "○" : v === "wrong" ? "✕" : i + 1}
                </button>
              );
            }
            return (
              <button
                key={p.id}
                onClick={() => goto(i)}
                aria-label={`${i + 1}번 문항`}
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold transition ${
                  cur
                    ? "bg-honey text-ink ring-4 ring-honey-soft"
                    : isDone
                      ? "bg-sage text-white"
                      : "border border-line bg-paper text-muted"
                }`}
              >
                {isDone && !cur ? (
                  <svg className="pop-in" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5L20 7" /></svg>
                ) : (
                  i + 1
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm text-muted">
          {/* 앱에서는 상단 바가 숨겨지므로 자동 저장 표시를 여기에 */}
          {!results && !closed && <span className="app-only"><SavedPill at={savedAt} /></span>}
          {closed ? <span>마감된 과제</span> : dueAt ? <span className="hidden sm:inline">{formatDue(dueAt)} 마감</span> : null}
          {results && <span>맞은 문항 {PROBLEMS.filter((p) => verdictOf(results[p.id]) === "ok").length}개</span>}
          <span className="font-semibold text-ink">
            {idx + 1} / {PROBLEMS.length}
          </span>
        </div>
      </div>

      {/* 본문. 마감된 과제는 채점 결과 화면 (가로·세로는 화면 너비가 아니라 실제 방향으로) */}
      {results ? (
        <main className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 md:landscape:grid-cols-[minmax(300px,360px)_1fr] md:landscape:grid-rows-1 md:landscape:gap-5 md:landscape:p-5">
          <section key={problem.id} className="problem-in flex max-h-[42dvh] flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-paper p-5 md:landscape:max-h-none md:landscape:p-6">
            <div className="flex flex-col gap-1.5">
              <div className="w-fit rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-muted">
                QUESTION {String(idx + 1).padStart(2, "0")}
              </div>
              <h1 className="text-2xl font-extrabold">채점 결과를 볼까요?</h1>
            </div>
            <div
              className={`whitespace-pre-wrap break-words rounded-2xl bg-sand px-4 ${
                problem.free ? "py-5 text-left text-base leading-relaxed" : "py-10 text-center font-[family-name:var(--font-math)] text-4xl"
              }`}
            >
              {problem.question}
            </div>
            {/* 문항 그림 (도형·좌표·그래프·입체도형 또는 선생님이 올린 그림) */}
            {problem.figure && <FigureView figure={problem.figure} className="mx-auto" />}
            {problem.concept && (
              <span className="w-fit rounded-full bg-sand px-3 py-1 text-xs text-muted">{problem.concept}</span>
            )}
            <ResultCard key={problem.id} r={results[problem.id]} />
            <div className="mt-auto flex items-center justify-between pt-2">
              <button
                onClick={() => goto(idx - 1)}
                disabled={idx === 0}
                className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:bg-sand disabled:opacity-40"
              >
                ← 이전 문항
              </button>
              <button
                onClick={() => goto(idx + 1)}
                disabled={idx === PROBLEMS.length - 1}
                className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:bg-sand disabled:opacity-40"
              >
                다음 문항 →
              </button>
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-2">
            <MySolution key={problem.id} r={results[problem.id]} />
          </section>
        </main>
      ) : (
        // 풀이 화면: 위에 문제(그림 문제면 오른쪽에 그림 칸), 아래에 나의 풀이 (연습장 + 정리 풀이) · 답안 칸
        // 문제 부분은 짧게(문제 글 옆에 그림 칸) 해서 나의 풀이 칸을 최대한 크게
        <main
          className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-3 md:landscape:px-5"
          onPointerDown={onSwipeStart}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeEnd}
          onPointerCancel={onSwipeEnd}
          style={{
            touchAction: "pan-y pinch-zoom", // 옆으로 미는 동작은 브라우저가 가져가지 않게 (문항 넘기기에 쓴다)
            transform: slide.x ? `translateX(${slide.x}px)` : undefined,
            transition: slide.anim ? "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
        >
          {/* 문제 칸: 그림 문제를 두 칸으로 풀 때는 연습장에 문제 글·그림이 있으니 숨기고 풀이 칸을 위로 올린다 */}
          {!(figure && twoPane) && (
          <section key={problem.id} className="problem-in flex shrink-0 items-stretch gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="w-fit rounded-full border border-line px-3 py-0.5 text-[11px] font-bold tracking-[0.14em] text-olive">
                QUESTION {String(idx + 1).padStart(2, "0")}
              </div>
              <div
                className={`max-h-[15dvh] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-[1.25rem] border border-line bg-paper px-4 py-2.5 ${
                  problem.free ? "text-base leading-relaxed" : "font-[family-name:var(--font-math)] text-2xl"
                }`}
              >
                <QuestionText text={problem.question} />
              </div>
            </div>
          </section>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              ✍️ 그림이나 계산은 <b className="text-ink">연습장</b>에 마음껏, 채점받을 풀이는 <b className="text-ink">정리 칸</b>에 한 줄씩 써 주세요.
            </span>
            {done[problem.id] && <span className="text-[#5d7a50]">✓ 제출한 풀이예요. 고쳐서 다시 제출할 수 있어요.</span>}
            <span className="ml-auto flex items-center gap-3">
              <button
                onClick={() => {
                  const n = nextUnsolved(idx);
                  if (n !== null) goto(n);
                }}
                className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                나중에 풀기
              </button>
              <span className="text-xs">⏱ {mm}:{ss}</span>
            </span>
          </div>

          <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-[2rem] border border-line bg-paper/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm font-semibold text-muted">나의 풀이</span>
              <div className="flex overflow-hidden rounded-full border border-line bg-paper text-sm">
                {([false, true] as const).map((two) => (
                  <button
                    key={String(two)}
                    onClick={() => setTwoPaneOf((m) => ({ ...m, [problem.id]: two }))}
                    className={`px-4 py-2 font-semibold transition ${twoPane === two ? "bg-honey text-ink" : "text-muted"}`}
                  >
                    {two ? "그림 있는 문제" : "그림 없는 문제"}
                  </button>
                ))}
              </div>
              <button onClick={undoActive} className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold">
                되돌리기
              </button>
              <button onClick={clearAll} className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold">
                모두 지우기
              </button>
            </div>

            {/* 두 칸: 가로 화면은 연습장 | 정리 풀이 나란히, 세로 화면은 위아래 */}
            <div className={`grid min-h-0 flex-1 gap-3 ${twoPane ? "grid-rows-2 md:landscape:grid-cols-2 md:landscape:grid-rows-1" : "grid-rows-1"}`}>
              <div className={`min-h-0 flex-col gap-1.5 ${twoPane ? "flex" : "hidden"}`}>
                <div className="flex items-center justify-between px-1 text-sm">
                  <b className="text-muted">연습장</b>
                  <span className="font-semibold text-olive">AI는 채점하지 않아요</span>
                </div>
                <div className="min-h-0 flex-1">
                  <InkCanvas
                    ref={pad}
                    variant="dots"
                    tool={tool}
                    color={color}
                    thick={thick}
                    backdrop={
                      // 그림 문제: 연습장 위쪽에 문제 글과 그림을 깔아 두고 그 위에 그린다
                      figure ? (
                        <div className="flex flex-col gap-2">
                          <span className="w-fit rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10px] font-bold tracking-[0.14em] text-olive">
                            QUESTION {String(idx + 1).padStart(2, "0")}
                          </span>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                            <QuestionText text={problem.question} />
                          </p>
                          <FigureView figure={figure} />
                        </div>
                      ) : null
                    }
                    initialStrokes={scratchRef.current[problem.id]}
                    onChange={draftsLoaded ? saveScratch : undefined}
                    onActive={() => (activeRef.current = "pad")}
                  />
                </div>
              </div>
              <div className="flex min-h-0 flex-col gap-1.5">
                <div className="flex items-center justify-between px-1 text-sm">
                  <b className="text-muted">정리 풀이</b>
                  <span className="font-semibold text-[#5d7a50]">이 칸만 위에서부터 읽어요</span>
                </div>
                <div className="min-h-0 flex-1">
                  <InkCanvas
                    ref={canvas}
                    variant="lined"
                    tool={tool}
                    color={color}
                    thick={thick}
                    initialStrokes={inkRef.current[problem.id]}
                    onChange={draftsLoaded ? saveDraft : undefined}
                    onActive={() => (activeRef.current = "main")}
                  />
                </div>
              </div>
            </div>

            {/* 아래 줄: 도구 알약 · 답안 칸 · 제출. 한 줄에 안 들어가면 답안·제출이 다음 줄 전체 폭 */}
            <div className="flex flex-wrap items-center gap-3">
              <InkToolPill tool={tool} setTool={setTool} color={color} setColor={setColor} thick={thick} setThick={setThick} />
              <div className="flex min-w-[22rem] flex-1 items-center gap-3">
                <AnswerField problemId={problem.id} value={answer} onChange={saveAnswer} onSubmit={() => !sending && submit()} disabled={sending || closed} />
                <button
                  onClick={submit}
                  disabled={sending || closed}
                  className="flex h-[54px] shrink-0 items-center gap-2 rounded-full bg-honey px-6 font-semibold text-ink shadow-sm transition hover:bg-honey-deep disabled:opacity-50"
                >
                  {closed ? "마감된 과제예요" : sending ? "제출 중…" : done[problem.id] ? "다시 제출하기" : "풀이 제출하기"} {!closed && <span aria-hidden>→</span>}
                </button>
              </div>
            </div>
          </section>
          <p className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted">
            <Chick size={18} />
            풀이 과정이 자동으로 기록되고 있어요.
          </p>
        </main>
      )}
    </div>
  );
}

// 모든 문항을 냈을 때: 병아리가 통통 뛰고 색종이가 떨어진다
const CONFETTI_COLORS = ["#f5d66f", "#87a07a", "#e8a090", "#e2b53c", "#9bb487"];
function Celebration({ onDone }: { onDone: () => void }) {
  // 색종이 위치·속도는 처음 한 번만 정한다
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.2 + Math.random() * 1.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    })),
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-cream/80 backdrop-blur-sm" onClick={onDone}>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, rotate: `${p.rotate}deg` }}
        />
      ))}
      <div className="celebrate-in flex flex-col items-center gap-4 rounded-3xl border border-line bg-paper px-12 py-10 text-center">
        <Chick size={132} pose="sprout" motion="cheer" />
        <div className="text-2xl font-extrabold">모든 문항을 제출했어요!</div>
        <p className="text-sm text-muted">수고했어요. 선생님이 곧 풀이를 확인해 줄 거예요.</p>
        <button onClick={onDone} className="mt-1 rounded-full bg-honey px-6 py-3 font-semibold">
          과제 목록으로 →
        </button>
      </div>
    </div>
  );
}

// 자동 저장 표시 (쓰면 이 기기에 바로 저장된다)
function SavedPill({ at }: { at: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sage/40 bg-sage-soft px-3 py-1 text-xs font-semibold text-[#5d7a50]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5L20 7" /></svg>
      {at ? "자동 저장됨" : "자동 저장"}
    </span>
  );
}

// 채점 결과: AI 채점 + 선생님 확인
function ResultCard({ r }: { r: MyResult | undefined }) {
  const v = verdictOf(r);
  if (!r) return <p className="rounded-2xl bg-sand px-4 py-3 text-sm text-muted">이 문항은 제출하지 않았어요.</p>;
  const ai = r.ai;
  const aiLabel =
    r.status === "error" ? "AI가 채점하지 못했어요" : !ai ? "AI가 아직 채점하지 않았어요" : ai.correct === true ? "정답" : ai.correct === false ? "오답" : "판정 보류 (글씨를 읽기 어려웠어요)";
  const t = r.teacher;
  const teacherLabel = !t
    ? null
    : !t.errorType || t.errorType === "UNREADABLE"
      ? "확인했어요"
      : t.errorType === "NONE"
        ? "오류 없음"
        : `오답 · ${ERROR_LABEL[t.errorType]}`;
  const teacherDiffers = t && ai && v !== (ai.correct === true ? "ok" : ai.correct === false ? "wrong" : "hold");
  return (
    <div className="flex flex-col gap-3">
      <div className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${VERDICT[v].cls}`}>{VERDICT[v].label}</div>

      <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
        <div className="mb-1 text-xs font-semibold text-muted">🤖 AI 채점</div>
        <div>
          <b>{aiLabel}</b>
          {ai?.correct === false && ai.errorType !== "NONE" && ai.errorType !== "UNREADABLE" && (
            <span className="text-muted"> · {ERROR_LABEL[ai.errorType]}</span>
          )}
        </div>
        {ai?.answer && <div className="mt-1 text-muted">내 답으로 읽은 것: <span className="text-ink">{ai.answer}</span></div>}
      </div>

      {r.answerText && (
        <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
          <span className="text-muted">답안 칸에 쓴 답: </span>
          <b className="font-[family-name:var(--font-math)]">{r.answerText}</b>
          {r.answerCorrect === true && <span className="ml-2 font-semibold text-[#5d7a50]">✓ 정답과 같아요</span>}
          {r.answerCorrect === false && <span className="ml-2 font-semibold text-[#b5624f]">✗ 정답과 달라요</span>}
        </div>
      )}

      {/* 틀렸을 때: 어디가 틀렸는지 (AI가 읽은 내 풀이에서 처음 틀린 줄 + 이유) */}
      {ai?.correct === false && (ai.reason || ai.lines.length > 0) && (
        <div className="rounded-2xl border border-salmon/60 bg-salmon-soft/40 px-4 py-3 text-sm">
          <div className="mb-1.5 text-xs font-semibold text-[#b5624f]">🔍 어디가 틀렸을까?</div>
          {ai.lines.length > 0 && (
            <ol className="mb-2 flex flex-col gap-1 font-[family-name:var(--font-math)]">
              {ai.lines.map((l, i) => {
                const bad = i === ai.firstErrorLine;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                      bad ? "bg-salmon-soft font-semibold text-[#b5624f]" : ai.firstErrorLine !== null && i > ai.firstErrorLine ? "text-muted" : ""
                    }`}
                  >
                    <span className="w-4 shrink-0 text-xs not-italic text-muted">{i + 1}</span>
                    <span className="min-w-0 break-words">{l || "…"}</span>
                    {bad && <span className="ml-auto shrink-0 font-sans text-[11px] not-italic">← 여기서부터</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {ai.reason && <p className="leading-relaxed">{ai.reason}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
        <div className="mb-1 text-xs font-semibold text-muted">🧑‍🏫 선생님 확인</div>
        {t ? (
          <>
            <b>{teacherLabel}</b>
            <span className="ml-1.5 text-xs text-muted">
              {new Date(t.confirmedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            {teacherDiffers && <p className="mt-1 text-xs text-muted">선생님이 AI 채점을 고쳤어요. 선생님 결과를 따라요.</p>}
            {t.memo && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-honey-soft/60 px-3 py-2 leading-relaxed">💬 {t.memo}</p>}
          </>
        ) : (
          <span className="text-muted">아직 선생님이 확인하지 않았어요.</span>
        )}
      </div>

      {(r.answer || r.solution.length > 0) && (
        <div className="rounded-2xl bg-sage-soft px-4 py-3 text-sm">
          {r.answer && (
            <div>
              정답 <b className="font-[family-name:var(--font-math)]">{r.answer}</b>
            </div>
          )}
          {/* 맞았으면 접어 두고, 틀렸으면 펼쳐서 */}
          {r.solution.length > 0 && (
            <details open={v !== "ok"} className="mt-1.5">
              <summary className="cursor-pointer text-xs text-[#5d7a50]">풀이 해설</summary>
              <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 font-[family-name:var(--font-math)]">
                {r.solution.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      {r.tries > 1 && <p className="text-xs text-muted">{r.tries}번 제출했어요. 마지막 풀이로 채점했어요.</p>}
    </div>
  );
}

// 내가 낸 마지막 풀이 (원본 이미지)
function MySolution({ r }: { r: MyResult | undefined }) {
  const [missing, setMissing] = useState(false);
  if (!r)
    return (
      <div className="grid flex-1 place-items-center rounded-3xl border border-dashed border-line bg-paper/60 text-sm text-muted">
        제출한 풀이가 없어요. 마감된 과제라 이제 낼 수 없어요.
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-3xl border border-line bg-paper p-4">
      <div className="flex items-center text-sm">
        <b>내 풀이</b>
        <span className="ml-auto text-xs text-muted">
          {new Date(r.submittedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 제출
        </span>
      </div>
      {missing ? (
        <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-line text-xs text-muted">풀이 이미지를 불러오지 못했어요.</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={r.submissionId}
          src={`/api/submissions/${r.submissionId}/image`}
          alt="내가 제출한 풀이"
          onError={() => setMissing(true)}
          className="w-full flex-1 rounded-2xl border border-line bg-white object-contain"
        />
      )}
    </div>
  );
}

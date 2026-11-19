"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/DateTimePicker";
import GroupSupplement, { groupStudents } from "@/components/GroupSupplement";
import JoinCode from "@/components/JoinCode";
import ReviewQueue from "@/components/ReviewQueue";
import StudentDetail, { type DetailTab, type SubFilter } from "@/components/StudentDetail";
import { useTeacherClass, type TeacherClass } from "@/components/useTeacherClass";
import { ERROR_LABEL, type ClassStats, type StudentStats } from "@/lib/types";

// 오늘의 교실
//  위쪽 고정 바(반·과제·기간·검색) → 오늘 할 일 3칸 → 탭 [학생 | 확인할 풀이 | 소그룹]
//  학생을 누르면 목록은 그대로 두고 오른쪽 패널에 상세가 열린다 (좁은 화면에서는 전체 화면, Esc 로 닫기)
//  지금 탭·거르기·열린 학생은 주소(?tab=&f=&sid=)에 남겨 새로고침·뒤로 가기에도 유지한다

type Tab = "students" | "review" | "groups";
const TABS: Tab[] = ["students", "review", "groups"];

type SortKey = "name" | "accuracy" | "repeatedCount" | "submitted" | "lastSubmittedAt";
type Sort = { key: SortKey; asc: boolean };

// 학생 거르기
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "none", label: "미제출" },
  { key: "partial", label: "일부 제출" },
  { key: "done", label: "다 냄" },
  { key: "review", label: "확인 필요" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
// 다 냄: 받은 문항을 다 냄 / 일부 제출: 1문항 이상 냈지만 안 낸 문항이 있음 / 미제출: 하나도 안 냄
// 확인 필요: AI가 판독하기 어렵거나 분석에 실패한 풀이가 있음 (교사 확인 전)
const filterOk = (s: StudentStats, f: FilterKey) =>
  f === "all" ||
  (f === "done" && s.total > 0 && s.submitted === s.total) ||
  (f === "partial" && s.submitted > 0 && s.submitted < s.total) ||
  (f === "none" && s.submitted === 0) ||
  (f === "review" && s.reviewCount > 0);

// 정렬. 값이 없는 학생은 항상 아래로
function sortStudents(list: StudentStats[], { key, asc }: Sort) {
  return [...list].sort((a, b) => {
    if (key === "name") return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const va = a[key] ?? null;
    const vb = b[key] ?? null;
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return asc ? va - vb : vb - va;
  });
}

// 마지막 제출 시각: 오늘이면 시각만
function fmtWhen(ms: number | null) {
  if (ms === null) return "-";
  const d = new Date(ms);
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `오늘 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

const accTone = (acc: number) => (acc < 60 ? "bg-salmon-soft text-[#b5624f]" : acc < 80 ? "bg-honey-soft text-olive" : "bg-sage-soft text-[#5d7a50]");

// ── 기간: 그 기간에 제출한 풀이만으로 지표를 계산 ──
type PeriodKey = "all" | "week" | "month" | "custom";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "전체 기간" },
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
  { key: "custom", label: "직접 지정" },
];
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// 이번 주는 월요일부터. 직접 지정은 시작일 0시 ~ 끝일 23:59:59
function periodRange(key: PeriodKey, custom: { from: string; to: string }): { from?: number; to?: number } {
  const now = new Date();
  if (key === "week") return { from: dayStart(now) - ((now.getDay() + 6) % 7) * 86400000 };
  if (key === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime() };
  if (key === "custom")
    return {
      from: custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : undefined,
      to: custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : undefined,
    };
  return {};
}

// 주소의 검색 값만 바꾼다 (화면을 다시 불러오지 않게 replaceState)
function setUrl(patch: Record<string, string | null>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, "", u);
}

export default function TeacherPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

type Detail = { id: string; tab?: DetailTab; filter?: SubFilter; n: number };

function Dashboard() {
  const params = useSearchParams();
  const { classes, selected: cls, select: selectClass, reload: reloadClasses, error: classError } = useTeacherClass({
    initial: params.get("class"),
  });
  const classId = cls?.id;
  const archived = !!cls?.archived;

  // 거르기 (위쪽 고정 바)
  const [assignment, setAssignment] = useState("");
  const [periodKey, setPeriodKey] = useState<PeriodKey>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = useMemo(() => periodRange(periodKey, custom), [periodKey, custom]);
  const customInvalid = periodKey === "custom" && range.from !== undefined && range.to !== undefined && range.from > range.to;
  const [query, setQuery] = useState("");

  // 탭 · 학생 거르기 · 열린 학생 (주소에 남긴다. 예전 주소 ?focus=1, ?filter=care 는 확인할 풀이 탭으로)
  const [tab, setTabState] = useState<Tab>(() => {
    const t = params.get("tab") as Tab | null;
    if (t && TABS.includes(t)) return t;
    return params.get("focus") === "1" || params.get("filter") === "care" ? "review" : "students";
  });
  const [filter, setFilterState] = useState<FilterKey>(() => {
    const f = params.get("f") as FilterKey | null;
    return f && FILTERS.some((x) => x.key === f) ? f : "all";
  });
  const [concept, setConcept] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "accuracy", asc: true }); // 정답률 낮은 학생부터
  const [detail, setDetailState] = useState<Detail | null>(() => {
    const sid = params.get("sid");
    return sid ? { id: sid, n: 0 } : null;
  });
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    setUrl({ tab: t === "students" ? null : t });
  };
  const setFilter = (f: FilterKey) => {
    setFilterState(f);
    setUrl({ f: f === "all" ? null : f });
  };
  const openDetail = useCallback((id: string, opts: { tab?: DetailTab; filter?: SubFilter } = {}) => {
    setDetailState((d) => ({ id, ...opts, n: (d?.n ?? 0) + 1 }));
    setUrl({ sid: id });
  }, []);
  const closeDetail = useCallback(() => {
    setDetailState(null);
    setUrl({ sid: null });
  }, []);

  // 실제 제출 지표: 분석이 끝나면 바로 반영되도록 주기적으로 갱신
  const [real, setReal] = useState<ClassStats | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!classId || customInvalid) return;
    const q = new URLSearchParams({
      class: classId,
      ...(assignment ? { assignment } : {}),
      ...(range.from !== undefined ? { from: String(range.from) } : {}),
      ...(range.to !== undefined ? { to: String(range.to) } : {}),
    });
    let stale = false; // 반을 바꾼 뒤 늦게 도착한 이전 반 응답은 버린다
    const load = () =>
      fetch(`/api/class-stats?${q}`)
        .then((r) => r.json())
        .then((d) => {
          if (stale) return;
          if (d.students) {
            setReal(d);
            setLoadError("");
          } else setLoadError(d.error ?? "학급 데이터를 불러오지 못했어요.");
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => {
      stale = true;
      clearInterval(t);
    };
  }, [classId, assignment, range, customInvalid]);

  // 반을 바꾸면 거르기·열린 학생을 처음으로
  const changeClass = (id: string) => {
    selectClass(id);
    setAssignment("");
    setConcept("");
    setReal(null);
    setOpenGroup(null);
    closeDetail();
    setUrl({ class: id });
  };

  const toggleArchive = async () => {
    if (!cls) return;
    const msg = cls.archived
      ? `'${cls.label}'을(를) 다시 올해 반으로 되돌릴까요? 학생들에게 이 반 과제가 다시 보여요.`
      : `'${cls.label}'을(를) 보관할까요?\n\n학년이 끝난 반을 보관하면 학생 화면에서 이 반 과제가 사라지고, 선생님 화면에서는 '지난 반'으로 읽기만 할 수 있어요. 기록은 지워지지 않아요.`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !cls.archived }),
    });
    if (!res.ok) alert((await res.json()).error);
    await reloadClasses();
  };

  const students = useMemo(() => real?.students ?? [], [real]);
  const groups = useMemo(() => groupStudents(students), [students]);
  // 소그룹 탭을 열면 고른 묶음이 없을 때 첫 묶음의 보충 과제 만들기를 바로 보여 준다
  const activeGroup = groups.find((g) => g.key === openGroup) ?? (openGroup === null ? groups[0] : undefined);

  // 지표
  const submittedCount = students.filter((s) => s.submitted > 0).length;
  const judgedTotal = students.reduce((a, s) => a + s.judged, 0);
  const avgAcc = judgedTotal ? Math.round(students.reduce((a, s) => a + (s.accuracy ?? 0) * s.judged, 0) / judgedTotal) : null;
  const reviewTotal = students.reduce((a, s) => a + s.reviewCount, 0);
  const notSubmitted = students.filter((s) => s.submitted === 0);

  // 학생 표: 이름 검색 · 거르기 · 취약 개념 → 정렬
  const concepts = useMemo(() => [...new Set(students.map((s) => s.weakConcept).filter((c): c is string => !!c))], [students]);
  const searched = useMemo(() => (query ? students.filter((s) => s.name.includes(query) || s.id.includes(query)) : students), [students, query]);
  const rows = useMemo(() => {
    let list = searched.filter((s) => filterOk(s, filter));
    if (concept) list = list.filter((s) => s.weakConcept === concept);
    return sortStudents(list, sort);
  }, [searched, filter, concept, sort]);
  const filterCount = (f: FilterKey) => searched.filter((s) => filterOk(s, f)).length;

  // Esc 로 패널 닫기
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDetail();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, closeDetail]);

  const goStudents = (f: FilterKey) => {
    setTab("students");
    setFilter(f);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 위쪽 고정 바: 반 · 과제 · 기간 · 검색 · 반 관리 */}
      <div className="solid sticky top-[57px] z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-2xl border border-line px-4 py-2.5">
        <ClassPicker classes={classes} selected={cls} onSelect={changeClass} />
        <span className="text-sm text-muted">{students.length}명</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
            className="max-w-56 rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            aria-label="과제 선택"
          >
            <option value="">과제 전체</option>
            {real?.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value as PeriodKey)}
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            aria-label="기간 선택"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {periodKey === "custom" && (
            <span className="flex items-center gap-1.5 text-sm">
              <DatePicker value={custom.from} max={custom.to || undefined} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} placeholder="처음" aria-label="시작일" />
              ~
              <DatePicker value={custom.to} min={custom.from || undefined} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} placeholder="오늘" aria-label="끝일" />
            </span>
          )}
          <span className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="학생 이름 검색"
              aria-label="학생 이름 검색"
              className="w-40 rounded-full border border-line bg-paper py-1.5 pl-4 pr-8 text-sm outline-none focus:border-honey-deep"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="검색 지우기" className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-muted hover:text-ink">
                ✕
              </button>
            )}
          </span>
          {cls && <ClassMenu cls={cls} onArchive={toggleArchive} />}
        </div>
      </div>

      {customInvalid && <p className="-mt-2 text-sm text-[#b5624f]">시작일이 끝일보다 늦어요.</p>}
      {(loadError || classError) && <div className="rounded-2xl bg-salmon-soft px-4 py-2.5 text-sm text-[#b5624f]">{loadError || classError}</div>}
      {archived && (
        <div className="rounded-2xl border border-line bg-sand px-4 py-2.5 text-sm text-muted">
          <b className="text-ink">보관된 지난 반</b>이에요. 그 해의 기록을 읽기만 할 수 있어요. 학생들에게는 이 반 과제가 보이지 않아요.
        </div>
      )}

      {/* 오늘 할 일: 누르면 해당 탭·거르기로 */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <TodoCard
            label="확인할 풀이"
            value={`${reviewTotal}개`}
            sub="AI 판독 어려움·채점 실패"
            hot={reviewTotal > 0}
            onClick={() => setTab("review")}
          />
          <TodoCard
            label="안 낸 학생"
            value={`${notSubmitted.length}명`}
            sub={notSubmitted.length ? notSubmitted.slice(0, 3).map((s) => s.name).join(", ") + (notSubmitted.length > 3 ? ` 외 ${notSubmitted.length - 3}명` : "") : "모두 1문항 이상 냈어요"}
            onClick={() => goStudents("none")}
          />
          <TodoCard
            label="같은 실수 소그룹"
            value={`${groups.length}개`}
            sub={groups.length ? "보충 과제를 한 번에 내요" : "같은 실수 학생이 2명 이상이면 생겨요"}
            onClick={() => setTab("groups")}
          />
        </div>
        <p className="px-1 text-sm text-muted">
          제출 <b className="text-ink">{submittedCount}/{students.length}명</b> · 평균 정답률{" "}
          <b className="text-ink">{avgAcc === null ? "-" : `${avgAcc}%`}</b>
          {judgedTotal > 0 && <> (AI 판정 {judgedTotal}문항 기준)</>}
          {periodKey !== "all" && !customInvalid && <> · {PERIODS.find((p) => p.key === periodKey)!.label}에 제출한 풀이로 계산</>}
        </p>
      </section>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ["students", "학생", students.length],
            ["review", "확인할 풀이", reviewTotal],
            ["groups", "소그룹", groups.length],
          ] as [Tab, string, number][]
        ).map(([k, label, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
            <span className={`ml-1.5 text-xs ${k === "review" && n > 0 ? "font-semibold text-[#b5624f]" : "opacity-80"}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab === "students" && (
        <div className={detail ? "grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : ""}>
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    filter === f.key ? "border-honey-deep bg-honey font-semibold" : "border-line bg-paper text-muted hover:bg-sand"
                  }`}
                >
                  {f.label} <span className="ml-0.5 text-xs opacity-80">{filterCount(f.key)}</span>
                </button>
              ))}
              {concepts.length > 0 && (
                <select
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  aria-label="취약 개념으로 거르기"
                  className="ml-auto rounded-full border border-line bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="">취약 개념 전체</option>
                  {concepts.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            <StudentTable rows={rows} sort={sort} setSort={setSort} compact={!!detail} selected={detail?.id ?? null} onOpen={openDetail} />
          </section>

          {detail && (
            <aside className="solid fixed inset-0 z-40 overflow-y-auto p-4 sm:p-6 lg:sticky lg:inset-auto lg:top-[136px] lg:z-auto lg:max-h-[calc(100vh-152px)] lg:rounded-3xl lg:border lg:border-line lg:p-5">
              <StudentDetail
                key={`${detail.id}:${detail.n}`}
                id={detail.id}
                stats={students.find((s) => s.id === detail.id)}
                start={{ tab: detail.tab, filter: detail.filter }}
                only={real?.assignments.find((a) => a.id === assignment)}
                onClose={closeDetail}
              />
            </aside>
          )}
        </div>
      )}

      {tab === "review" && classId && (
        <ReviewQueue key={classId} classId={classId} filter={customInvalid ? {} : { assignment: assignment || undefined, ...range }} readOnly={archived} />
      )}

      {tab === "groups" && (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="flex flex-col gap-2">
            {groups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line p-5 text-center text-sm text-muted">
                같은 실수를 한 학생이 2명 이상 모이면 여기에 묶여요.
              </div>
            ) : (
              groups.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setOpenGroup(g.key)}
                  aria-pressed={activeGroup?.key === g.key}
                  className={`solid flex flex-col gap-1.5 rounded-2xl border p-4 text-left ${activeGroup?.key === g.key ? "border-honey-deep ring-2 ring-honey/50" : "border-line hover:border-honey"}`}
                >
                  <span className="flex items-center gap-2">
                    <b>{g.name}</b>
                    <span className="ml-auto rounded-full bg-honey-soft px-2.5 py-0.5 text-xs text-olive">{g.members.length}명</span>
                  </span>
                  <span className="text-sm text-muted">
                    {g.members.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && " · "}
                        {m.name}
                        {m.repeatedError && m.repeatedError === g.targetError && <span className="text-[#b5624f]"> 반복</span>}
                      </span>
                    ))}
                  </span>
                  {!archived && (
                    <span
                      className={`mt-1 self-start rounded-full px-3 py-1 text-xs font-semibold ${
                        activeGroup?.key === g.key ? "bg-sage text-white" : "border border-sage/60 text-[#4d6842]"
                      }`}
                    >
                      {activeGroup?.key === g.key ? "보충 과제 만드는 중 →" : `${g.members.length}명에게 보충 과제 내기`}
                    </span>
                  )}
                </button>
              ))
            )}
          </section>
          <section>
            {archived ? (
              <p className="rounded-3xl border border-line bg-sand p-5 text-sm text-muted">보관된 반에는 보충 과제를 낼 수 없어요.</p>
            ) : activeGroup && classId ? (
              <GroupSupplement key={`${classId}-${activeGroup.key}`} classId={classId} group={activeGroup} onClose={() => setOpenGroup("")} />
            ) : (
              groups.length > 0 && (
                <div className="rounded-3xl border border-dashed border-line p-8 text-center text-sm text-muted">
                  왼쪽 묶음의 &lsquo;보충 과제 내기&rsquo;를 누르면 그 학생들에게 한 번에 낼 보충 문항을 만들어요.
                </div>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// 학생 표 (제출 현황 + 학습 현황을 한 줄에). compact: 오른쪽 패널이 열렸을 때 좁은 열만
function StudentTable({
  rows,
  sort,
  setSort,
  compact,
  selected,
  onOpen,
}: {
  rows: StudentStats[];
  sort: Sort;
  setSort: (fn: (s: Sort) => Sort) => void;
  compact: boolean;
  selected: string | null;
  onOpen: (id: string, opts?: { tab?: DetailTab; filter?: SubFilter }) => void;
}) {
  const th = (key: SortKey, label: string) => (
    <th className="whitespace-nowrap px-3 py-3 text-left font-medium first:pl-4">
      <button onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))} className="hover:text-ink">
        {label} <span className="text-honey-deep">{sort.key === key ? (sort.asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
  const plain = (label: string) => <th className="whitespace-nowrap px-3 py-3 text-left font-medium">{label}</th>;

  return (
    <div className="solid overflow-x-auto rounded-3xl border border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            {th("name", "학생")}
            {!compact && th("submitted", "제출")}
            {th("accuracy", "정답률")}
            {plain("취약 개념")}
            {!compact && th("repeatedCount", "반복 오류")}
            {!compact && plain("변화")}
            {!compact && th("lastSubmittedAt", "마지막 제출")}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted">
                해당하는 학생이 없어요.
              </td>
            </tr>
          )}
          {rows.map((s) => {
            const on = selected === s.id;
            const pct = s.total ? Math.round((s.submitted / s.total) * 100) : 0;
            return (
              <tr
                key={s.id}
                onClick={() => onOpen(s.id)}
                aria-selected={on}
                className={`cursor-pointer border-t border-line/70 ${on ? "bg-honey-soft" : "hover:bg-honey-soft/40"}`}
              >
                <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                  {/* 키보드로도 열 수 있게 이름은 버튼 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(s.id);
                    }}
                    className="font-semibold hover:underline"
                  >
                    {s.name}
                  </button>
                  {s.reviewCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(s.id, { tab: "subs", filter: "review" });
                      }}
                      title="확인할 풀이 바로 보기"
                      className="ml-2 rounded-full bg-salmon-soft px-2 py-0.5 text-xs font-semibold text-[#b5624f] hover:bg-salmon/40"
                    >
                      확인 {s.reviewCount}
                    </button>
                  )}
                </td>
                {!compact && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-sand" aria-hidden>
                        <div className="h-full rounded-full bg-sage-light" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-muted">
                        {s.submitted}/{s.total}
                      </span>
                    </div>
                  </td>
                )}
                <td className="px-3 py-2.5">
                  {s.accuracy === null ? <span className="text-muted">-</span> : <span className={`rounded-md px-2 py-0.5 font-semibold ${accTone(s.accuracy)}`}>{s.accuracy}%</span>}
                </td>
                <td className="max-w-48 truncate px-3 py-2.5" title={s.weakConcept ?? undefined}>
                  {s.weakConcept ?? <span className="text-muted">-</span>}
                </td>
                {!compact && (
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.repeatedError ? `${ERROR_LABEL[s.repeatedError]} ×${s.repeatedCount}` : <span className="text-muted">-</span>}
                  </td>
                )}
                {!compact && (
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {s.trend === "개선" ? (
                      <span className="font-semibold text-[#5d7a50]">↗ 개선</span>
                    ) : s.trend === "확인 필요" ? (
                      <span className="font-semibold text-[#b5624f]">확인 필요</span>
                    ) : (
                      <span className="text-muted">{s.trend}</span>
                    )}
                  </td>
                )}
                {!compact && <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtWhen(s.lastSubmittedAt)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TodoCard({ label, value, sub, hot, onClick }: { label: string; value: string; sub: string; hot?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-0 flex-col rounded-2xl border px-3 py-3 text-left transition hover:-translate-y-0.5 sm:rounded-3xl sm:px-5 sm:py-4 ${hot ? "border-salmon/60 bg-salmon-soft" : "border-line bg-paper"}`}
    >
      <span className="flex items-center text-xs text-muted sm:text-sm">
        <span className="truncate">{label}</span>
        <span className="ml-auto hidden transition group-hover:translate-x-0.5 sm:inline">→</span>
      </span>
      <span className={`mt-1 text-2xl font-bold sm:text-3xl ${hot ? "text-[#b5624f]" : ""}`}>{value}</span>
      <span className="mt-1 hidden truncate text-sm text-muted sm:block">{sub}</span>
    </button>
  );
}

// 반 이름을 누르면 반 목록이 펼쳐진다 (올해 반 → 지난 반)
function ClassPicker({ classes, selected, onSelect }: { classes: TeacherClass[]; selected?: TeacherClass; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, open, () => setOpen(false));

  return (
    <div ref={box} className="relative">
      <h1>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!classes.length}
          aria-expanded={open}
          aria-label="반 바꾸기"
          className="flex items-center gap-1.5 text-left text-xl font-extrabold hover:text-olive"
        >
          {selected?.label ?? (classes.length ? "반" : "반 불러오는 중…")}
          {classes.length > 0 && <span className={`text-base text-muted transition ${open ? "rotate-180" : ""}`}>▾</span>}
        </button>
      </h1>
      {open && (
        <div className="solid absolute left-0 top-full z-30 mt-2 flex min-w-60 flex-col gap-1 rounded-2xl border border-line p-2 shadow-lg">
          {[false, true].map((past) => {
            const group = classes.filter((c) => c.archived === past);
            return group.length ? (
              <div key={String(past)} className="flex flex-col">
                <span className="px-3 pb-1 pt-2 text-xs text-muted">{past ? "지난 반 (보관됨)" : "올해 반"}</span>
                {group.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                    className={`rounded-xl px-3 py-2 text-left text-sm ${c.id === selected?.id ? "bg-honey-soft font-semibold" : "hover:bg-sand"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

// '⋯ 반 관리': 반 코드(가입용)와 반 보관. 자주 쓰지 않아서 메뉴 안에 둔다
function ClassMenu({ cls, onArchive }: { cls: TeacherClass; onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, open, () => setOpen(false));

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="반 관리"
        title="반 관리"
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:bg-sand"
      >
        ⋯
      </button>
      {open && (
        <div className="solid absolute right-0 top-full z-30 mt-2 flex w-80 flex-col gap-2 rounded-2xl border border-line p-3 shadow-lg">
          <b className="px-1 text-sm">반 관리 · {cls.label}</b>
          {!cls.archived && (
            <div className="rounded-xl bg-sand/60 px-3 py-2">
              <div className="text-xs text-muted">학생 회원가입용 반 코드</div>
              <JoinCode classId={cls.id} archived={cls.archived} />
            </div>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            className="rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-sand"
          >
            {cls.archived ? "↺ 이 반 보관 해제 (올해 반으로)" : "이 반 보관하기 (학년이 끝났을 때)"}
          </button>
        </div>
      )}
    </div>
  );
}

// 바깥을 누르면 닫는다
function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, open, close]);
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CONCEPT_KEYS, conceptLabel, errorLabel } from "@/lib/constants";
import { buildRows, fmtSec, type StudentLite, type StudentRow, type SubLite } from "@/lib/stats";

type Assignment = { id: string; title: string; problemIds: string[] };
type SortKey = "number" | "submitted" | "accuracy" | "avgSec" | "repeat" | "needsReview";
type StatusFilter = "all" | "review" | "missing" | "repeat";

export default function ClassTable({
  students,
  assignments,
  problemConcept,
  subs,
}: {
  students: StudentLite[];
  assignments: Assignment[];
  problemConcept: Record<string, string>;
  subs: SubLite[];
}) {
  const [assignmentId, setAssignmentId] = useState<string>(assignments[0]?.id ?? "all");
  const [concept, setConcept] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "accuracy", asc: true });

  const rows = useMemo(() => {
    const assignment = assignments.find((a) => a.id === assignmentId);
    let problemIds = assignment ? assignment.problemIds : assignments.flatMap((a) => a.problemIds);
    if (concept !== "all") problemIds = problemIds.filter((p) => problemConcept[p] === concept);
    const pset = new Set(problemIds);
    const regular = new Set(assignments.map((a) => a.id));
    const filtered = subs.filter(
      (s) =>
        (assignment ? s.assignment_id === assignment.id : regular.has(s.assignment_id)) &&
        (concept === "all" || problemConcept[s.problem_id] === concept || s.concept === concept) &&
        pset.has(s.problem_id),
    );

    let r = buildRows(students, filtered, problemIds.length);
    if (status === "review") r = r.filter((x) => x.needsReview > 0);
    if (status === "missing") r = r.filter((x) => x.submitted < x.total);
    if (status === "repeat") r = r.filter((x) => x.repeatErrors.length > 0);

    const val = (x: StudentRow): number => {
      switch (sort.key) {
        case "number":
          return x.number;
        case "submitted":
          return x.submitted;
        case "accuracy":
          return x.accuracy ?? 2;
        case "avgSec":
          return x.avgSec ?? -1;
        case "repeat":
          return x.repeatErrors.reduce((a, b) => a + b.count, 0);
        case "needsReview":
          return x.needsReview;
      }
    };
    return [...r].sort((a, b) => (sort.asc ? val(a) - val(b) : val(b) - val(a)));
  }, [assignments, assignmentId, concept, problemConcept, sort, status, students, subs]);

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-3 text-left font-semibold">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
      >
        {label}
        <span className="text-xs">{sort.key === key ? (sort.asc ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  const select = "rounded-xl border border-line bg-card px-3 py-2 text-sm";

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <select className={select} value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
          <option value="all">전체 과제</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <select className={select} value={concept} onChange={(e) => setConcept(e.target.value)}>
          <option value="all">취약 개념 · 전체</option>
          {CONCEPT_KEYS.map((k) => (
            <option key={k} value={k}>
              {conceptLabel(k)}
            </option>
          ))}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">상태 · 전체</option>
          <option value="review">확인 필요</option>
          <option value="repeat">반복 오류 있음</option>
          <option value="missing">미제출 있음</option>
        </select>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line bg-paper text-ink-soft">
            <tr>
              {th("number", "학생")}
              {th("submitted", "제출")}
              {th("accuracy", "정답률")}
              {th("avgSec", "평균 풀이 시간")}
              <th className="px-3 py-3 text-left font-semibold">취약 개념</th>
              {th("repeat", "반복 오류")}
              <th className="px-3 py-3 text-left font-semibold">학습 변화</th>
              {th("needsReview", "확인")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                <td className="px-3 py-3">
                  <Link href={`/teacher/students/${r.id}`} className="font-semibold hover:underline">
                    {r.number}. {r.name}
                  </Link>
                  {r.hasDemo && <span className="chip ml-1 bg-paper text-ink-soft">가상</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={r.submitted < r.total ? "text-alert" : ""}>
                    {r.submitted}/{r.total}
                  </span>
                  {r.analyzing > 0 && <span className="ml-1 text-xs text-ink-soft">(분석 중 {r.analyzing})</span>}
                </td>
                <td className="px-3 py-3">
                  {r.accuracy == null ? (
                    "-"
                  ) : (
                    <span
                      className={`chip ${r.accuracy < 0.5 ? "bg-alert-soft text-alert" : r.accuracy < 0.8 ? "bg-warn-soft" : "bg-leaf-soft text-leaf"}`}
                    >
                      {Math.round(r.accuracy * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">{fmtSec(r.avgSec)}</td>
                <td className="px-3 py-3">{conceptLabel(r.weakConcept)}</td>
                <td className="px-3 py-3">
                  {r.repeatErrors.length
                    ? r.repeatErrors.map((e) => (
                        <span key={e.type} className="chip mr-1 bg-alert-soft text-alert">
                          {errorLabel(e.type)} ×{e.count}
                        </span>
                      ))
                    : "-"}
                </td>
                <td className="px-3 py-3">
                  {r.trend === "up" && <span className="text-leaf">개선 ↑</span>}
                  {r.trend === "down" && <span className="text-alert">주의 ↓</span>}
                  {r.trend === "flat" && <span className="text-ink-soft">유지</span>}
                  {r.trend === null && "-"}
                </td>
                <td className="px-3 py-3">
                  {r.needsReview > 0 ? <span className="chip bg-warn-soft">확인 필요 {r.needsReview}</span> : "-"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ink-soft">
                  조건에 맞는 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        반복 오류 = 같은 유형 2회 이상 · 학습 변화 = 앞쪽 절반 대비 뒤쪽 절반 정답률 · &apos;가상&apos; 표시는 시연용 데이터
      </p>
    </>
  );
}

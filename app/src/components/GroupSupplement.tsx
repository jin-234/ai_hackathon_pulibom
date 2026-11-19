"use client";

import { useState } from "react";
import { checkRow, CountSelect, editRow, toQuestion } from "@/components/SupplementPanel";
import type { SupplementCandidate, SupplementDraft } from "@/lib/supplement";
import { ERROR_LABEL, formatDue, type ErrorType, type StudentStats } from "@/lib/types";

// ── 소그룹: 같은 약점(가장 많이 나온 오류 유형, 없으면 취약 개념)을 가진 학생 묶기 ──
export type Group = {
  key: string;
  name: string;
  targetError: ErrorType | null;
  concept: string | null;
  members: StudentStats[];
};

export function groupStudents(students: StudentStats[]): Group[] {
  const map = new Map<string, Group>();
  for (const s of students) {
    if (s.submitted === 0) continue;
    const key = s.topError ? `e:${s.topError}` : s.weakConcept ? `c:${s.weakConcept}` : null;
    if (!key) continue;
    if (!map.has(key))
      map.set(key, {
        key,
        name: s.topError ? `${ERROR_LABEL[s.topError]} 오류` : `${s.weakConcept} 취약`,
        targetError: s.topError,
        concept: s.topError ? null : s.weakConcept,
        members: [],
      });
    map.get(key)!.members.push(s);
  }
  // 2명 이상인 묶음만 소그룹 (한 명이면 학생 상세에서 개인 보충)
  return [...map.values()].filter((g) => g.members.length >= 2).sort((a, b) => b.members.length - a.members.length);
}

type Row = SupplementCandidate & { key: string };
const key = () => Math.random().toString(36).slice(2, 9);
const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};

// 소그룹 보충 과제: 문제은행에서 후보를 받아 → 교사가 확인·수정 → 그룹 전체에 한 번에 배정
export default function GroupSupplement({ classId, group, onClose }: { classId: string; group: Group; onClose: () => void }) {
  const [picked, setPicked] = useState(() => new Set(group.members.map((m) => m.id)));
  const [draft, setDraft] = useState<SupplementDraft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState(`보충 · ${group.name}`);
  const [withDue, setWithDue] = useState(true);
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState<"" | "draft" | "assign">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const makeDraft = async (n = count) => {
    setBusy("draft");
    setError("");
    try {
      const res = await fetch(`/api/classes/${classId}/groups/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: [...picked], targetError: group.targetError, concept: group.concept, count: n }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDraft(d);
      setRows(d.candidates.map((c: SupplementCandidate) => ({ ...c, key: key() })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const assign = async () => {
    if (!draft) return;
    setBusy("assign");
    setError("");
    try {
      const res = await fetch(`/api/classes/${classId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: [...picked],
          group: group.name,
          title,
          concept: draft.concept,
          targetError: draft.targetError,
          sourceSubmissionIds: draft.sourceSubmissionIds,
          dueAt: withDue ? tomorrow() : null,
          questions: rows.filter((r) => r.question.trim()).map(toQuestion),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNotice(`'${d.title}' ${d.problems.length}문항을 ${picked.size}명에게 배정했어요. 결과는 학생마다 상세 화면 '보충 지도'에 쌓여요.`);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const valid = rows.filter((r) => r.question.trim() && checkRow(r).ok).length;

  return (
    <div className="solid flex flex-col gap-3 rounded-3xl border border-sage/50 p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">소그룹 보충 · {group.name}</h3>
        <button onClick={onClose} aria-label="닫기" className="ml-auto grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-sand">
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">받을 학생</span>
        {group.members.map((m) => (
          <label
            key={m.id}
            className={`flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${picked.has(m.id) ? "border-sage bg-sage-soft" : "border-line text-muted"}`}
          >
            <input
              type="checkbox"
              checked={picked.has(m.id)}
              onChange={(e) =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (e.target.checked) n.add(m.id);
                  else n.delete(m.id);
                  return n;
                })
              }
              className="h-3.5 w-3.5 accent-[#7f9a72]"
            />
            {m.name}
          </label>
        ))}
      </div>

      {notice && <p className="rounded-xl bg-sage-soft px-3 py-2 text-[#5d7a50]">{notice}</p>}
      {error && <p className="rounded-xl bg-salmon-soft px-3 py-2 text-[#b5624f]">{error}</p>}
      {/* 보충 문항은 선생님이 버튼을 눌러야 만든다 (열기만 해서는 만들지 않음) */}
      {!draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-4">
          <span className="text-muted">받을 학생과 문항 수를 고른 뒤 보충 문항을 만들어요.</span>
          <span className="ml-auto flex items-center gap-2">
            <CountSelect value={count} disabled={busy !== ""} onChange={setCount} />
            <button
              onClick={() => makeDraft()}
              disabled={busy !== "" || !picked.size}
              className="rounded-full bg-sage px-5 py-2.5 font-semibold text-white hover:bg-[#4d6842] disabled:opacity-50"
            >
              {busy === "draft" ? "문항을 고르는 중…" : "보충 문항 만들기"}
            </button>
          </span>
        </div>
      )}
      {draft && busy === "draft" && <p className="text-muted">문항을 고르는 중…</p>}

      {draft && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-line bg-paper px-2.5 py-0.5">개념: {draft.concept}</span>
            {draft.targetError && <span className="rounded-full border border-line bg-paper px-2.5 py-0.5">목표 오류: {ERROR_LABEL[draft.targetError]}</span>}
            <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-muted">근거 풀이 {draft.sourceSubmissionIds.length}개</span>
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
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">과제 이름</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input py-2 text-sm" />
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
            <input type="checkbox" checked={withDue} onChange={(e) => setWithDue(e.target.checked)} className="h-4 w-4 accent-[#e2b53c]" />
            내일 밤({formatDue(tomorrow())})까지 마감
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={assign}
              disabled={busy !== "" || !valid || !picked.size}
              className="rounded-full bg-sage px-5 py-2.5 font-semibold text-white hover:bg-[#4d6842] disabled:opacity-50"
            >
              {busy === "assign" ? "배정 중…" : `${picked.size}명에게 ${valid}문항 배정`}
            </button>
            <button onClick={() => makeDraft()} disabled={busy !== ""} className="rounded-full border border-line px-4 py-2.5 text-muted hover:bg-sand disabled:opacity-50">
              ↻ 다른 문항으로
            </button>
            <CountSelect
              value={count}
              disabled={busy !== ""}
              onChange={(n) => {
                setCount(n);
                makeDraft(n); // 개수를 바꾸면 그 개수로 다시 만든다
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

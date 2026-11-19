"use client";

import { useState } from "react";
import { CountSelect } from "@/components/SupplementPanel";
import { gradeLabel, lessonTitle, unitsOf, type Lesson } from "@/lib/curriculum";
import type { UnitItem } from "@/lib/unitProblems";

// 과제 출제: 반의 학년 교육과정 단원 목록 → 소단원을 고르면 과제 이름을 채우고, 문항은 문제은행 틀 또는 AI로 만든다 (직접 입력도 그대로 가능)
export function CurriculumPicker({
  classId,
  grade,
  onTitle,
  onItems,
}: {
  classId: string;
  grade: number;
  onTitle: (title: string) => void;
  onItems: (items: UnitItem[]) => void;
}) {
  const units = unitsOf(grade);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState<"bank" | "ai" | null>(null);
  const [error, setError] = useState("");
  const unit = units.find((u) => u.id === unitId) ?? null;

  if (!units.length) return null;

  const pickLesson = (l: Lesson) => {
    if (!unit) return;
    setLesson(l);
    setError("");
    onTitle(lessonTitle(grade, unit, l));
  };

  const make = async (mode: "bank" | "ai") => {
    if (!lesson) return;
    setBusy(mode);
    setError("");
    try {
      const res = await fetch(`/api/classes/${classId}/unit-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, count, mode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onItems(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/60 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold">{gradeLabel(grade)} 교육과정에서 고르기</span>
        <span className="text-[11px] text-muted">2022 개정 · 단원을 고르면 과제 이름이 채워져요</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="대단원">
        {units.map((u) => (
          <button
            key={u.id}
            type="button"
            role="radio"
            aria-checked={unitId === u.id}
            onClick={() => {
              setUnitId(unitId === u.id ? null : u.id);
              setLesson(null);
            }}
            className={`rounded-full px-3 py-1 text-xs ${unitId === u.id ? "bg-ink font-semibold text-paper" : "border border-line text-muted hover:bg-sand"}`}
          >
            {u.no}. {u.name}
          </button>
        ))}
      </div>

      {unit && (
        <ul className="flex flex-col gap-1.5">
          {unit.lessons.map((l) => {
            const on = lesson?.id === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => pickLesson(l)}
                  aria-pressed={on}
                  className={`flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-2 text-left text-sm ${on ? "border border-honey bg-paper" : "bg-paper/60 hover:bg-paper"}`}
                >
                  <span className="font-semibold">{l.name}</span>
                  {l.templates?.length ? <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] text-[#5d7a50]">문제은행</span> : null}
                  <span className="basis-full text-[11px] text-muted">{l.desc}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lesson && (
        <div className="flex flex-wrap items-center gap-2">
          <CountSelect value={count} onChange={setCount} disabled={busy !== null} />
          {lesson.templates?.length ? (
            <button
              type="button"
              onClick={() => make("bank")}
              disabled={busy !== null}
              className="rounded-full bg-honey px-3 py-1.5 text-xs font-semibold hover:bg-honey-deep disabled:opacity-40"
            >
              {busy === "bank" ? "만드는 중…" : "문제은행으로 만들기"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => make("ai")}
            disabled={busy !== null}
            className={`rounded-full px-3 py-1.5 text-xs disabled:opacity-40 ${lesson.templates?.length ? "border border-line text-muted hover:bg-sand" : "bg-honey font-semibold hover:bg-honey-deep"}`}
          >
            {busy === "ai" ? "AI가 만드는 중…" : "AI로 만들기"}
          </button>
          <span className="text-[11px] text-muted">
            {lesson.templates?.length ? "문제은행은 정답을 자동으로 확인해요." : "AI 문항은 정답을 꼭 확인해 주세요."} 아래에 직접 입력해도 돼요.
          </span>
        </div>
      )}
      {error && <p className="rounded-xl bg-salmon-soft px-3 py-2 text-xs text-[#b5624f]">{error}</p>}
    </div>
  );
}

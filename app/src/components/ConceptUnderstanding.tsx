"use client";

import { useState } from "react";
import { SCHOOL_STAGES, type SchoolStage } from "@/lib/concepts";
import type { StudentStats } from "@/lib/types";

// 이해도 기준 (학급 표 정답률 색과 같은 기준)
export const STRONG = 80;
export const WEAK = 60;
const level = (acc: number) =>
  acc >= STRONG
    ? { label: "잘 이해함", bar: "bg-sage-light", text: "text-[#5d7a50]" }
    : acc >= WEAK
      ? { label: "보통", bar: "bg-honey", text: "text-olive" }
      : { label: "보완 필요", bar: "bg-salmon", text: "text-[#b5624f]" };

// 개념별 이해도: 문항마다 마지막 풀이 기준 정답률 (다시 풀었으면 다시 푼 결과). 낮은 개념부터
//  개념이 많아서 중등·고등 버튼으로 나눠 한 과정씩 보여 준다. 처음엔 개념이 가장 많은 과정
export default function ConceptUnderstanding({ concepts }: { concepts: StudentStats["conceptHistory"] }) {
  const [picked, setPicked] = useState<SchoolStage | null>(null);
  if (!concepts.length) return null; // 채점된 풀이가 없으면 그래프도 없음
  const all = concepts.map((c) => ({ concept: c.concept, stage: c.stage, acc: c.after ?? c.before, n: c.n, from: c.after !== null ? c.before : null }));
  const count = (st: SchoolStage) => all.filter((r) => r.stage === st).length;
  const busiest = SCHOOL_STAGES.reduce((a, b) => (count(b) > count(a) ? b : a), "중등" as SchoolStage);
  const stage = picked && count(picked) ? picked : busiest; // 고른 과정에 개념이 없어지면 (학생이 바뀌면) 다시 기본으로
  const rows = all.filter((r) => r.stage === stage).sort((a, b) => a.acc - b.acc);
  const weak = rows.filter((r) => r.acc < WEAK).length;
  return (
    <section className="solid @container rounded-3xl border border-line p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">개념별 이해도</h2>
        <span className="text-xs text-muted">채점된 풀이의 정답률 · {STRONG}% 이상 잘 이해함, {WEAK}% 미만 보완 필요</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="학교 과정">
        {SCHOOL_STAGES.map((st) => {
          const n = count(st);
          return (
            <button
              key={st}
              role="tab"
              aria-selected={stage === st}
              disabled={!n}
              onClick={() => setPicked(st)}
              className={`rounded-full px-4 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                stage === st ? "bg-honey font-semibold text-ink" : "border border-line text-muted hover:bg-sand"
              }`}
            >
              {st} 개념
              <span className="ml-1 text-xs opacity-70">{n}</span>
            </button>
          );
        })}
        {weak > 0 && <span className="ml-auto self-center text-xs text-[#b5624f]">보완 필요 {weak}개</span>}
      </div>
      <ul className="flex flex-col gap-2 text-sm" role="tabpanel">
        {rows.map((r) => {
          const lv = level(r.acc);
          return (
            <li key={r.concept} className="grid grid-cols-[minmax(5rem,8rem)_1fr] items-center gap-x-3 gap-y-0.5 @lg:grid-cols-[minmax(6rem,10rem)_1fr_auto]">
              <span className="truncate" title={r.concept}>
                {r.concept}
              </span>
              <div className="relative h-4 overflow-hidden rounded-full bg-sand">
                {/* 기준선 */}
                <span className="absolute inset-y-0 w-px bg-paper" style={{ left: `${WEAK}%` }} />
                <span className="absolute inset-y-0 w-px bg-paper" style={{ left: `${STRONG}%` }} />
                <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${Math.max(r.acc, 3)}%` }} />
              </div>
              <span className="col-start-2 whitespace-nowrap text-xs @lg:col-start-auto">
                <b className={lv.text}>{r.acc}%</b> <span className={lv.text}>{lv.label}</span>
                <span className="ml-1 text-muted">
                  {r.n}문항{r.from !== null && r.from !== r.acc ? ` · 처음 ${r.from}%` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

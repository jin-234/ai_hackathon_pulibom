"use client";

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
export default function ConceptUnderstanding({ concepts }: { concepts: StudentStats["conceptHistory"] }) {
  if (!concepts.length) return null; // 채점된 풀이가 없으면 그래프도 없음
  const rows = concepts.map((c) => ({ concept: c.concept, acc: c.after ?? c.before, n: c.n, from: c.after !== null ? c.before : null })).sort((a, b) => a.acc - b.acc);
  return (
    <section className="solid @container rounded-3xl border border-line p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">개념별 이해도</h2>
        <span className="text-xs text-muted">채점된 풀이의 정답률 · {STRONG}% 이상 잘 이해함, {WEAK}% 미만 보완 필요</span>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
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

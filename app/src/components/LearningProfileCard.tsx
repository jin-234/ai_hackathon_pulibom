"use client";

import { useEffect, useState } from "react";
import type { LearningProfile } from "@/lib/learningProfile";
import { ERROR_LABEL } from "@/lib/types";

// 학습 프로필: 풀이 기록에서 계산한 '남은 약점 / 이미 된 것'. 다음 보충 문제를 고를 때 그대로 반영된다

export default function LearningProfileCard({ studentId, refreshKey }: { studentId: string; refreshKey?: number }) {
  const [p, setP] = useState<LearningProfile | null>(null);

  useEffect(() => {
    fetch(`/api/students/${studentId}/profile`)
      .then((r) => r.json())
      .then((d) => d && Array.isArray(d.active) && setP(d))
      .catch(() => {});
  }, [studentId, refreshKey]);

  if (!p) return null;
  const empty = !p.active.length && !p.overcome.length && !p.mastered.length && !p.strong.length;

  return (
    <section className="rounded-3xl border border-line bg-paper p-5">
      <h2 className="font-semibold">
        학습 프로필 <span className="text-xs font-normal text-muted">다음 보충 문제 고를 때 반영돼요</span>
      </h2>
      {empty ? (
        <p className="mt-2 text-sm text-muted">아직 판정된 풀이가 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Box title="남은 약점 · 우선 연습" tone="bg-salmon-soft/60" empty="반복되는 오류가 없어요">
            {p.active.map((e) => (
              <Chip key={e}>{ERROR_LABEL[e]}</Chip>
            ))}
          </Box>
          <Box title="극복한 오류 · 덜 내기" tone="bg-sage-soft/60" empty="아직 없어요">
            {p.overcome.map((o) => (
              <Chip key={o.error}>
                {ERROR_LABEL[o.error]} <span className="text-muted">연속 {o.streak}번 정답</span>
              </Chip>
            ))}
          </Box>
          <Box title="잘하는 개념 · 덜 내기" tone="bg-sage-soft/60" empty="아직 없어요 (3문항 이상, 80% 이상)">
            {p.strong.map((s) => (
              <Chip key={s.concept}>
                {s.concept} <span className="text-muted">{s.correct}/{s.judged}</span>
              </Chip>
            ))}
          </Box>
          <Box title="익힌 문제 틀 · 다음 단계로" tone="bg-honey-soft/50" empty="아직 없어요">
            {p.mastered.map((m) => (
              <Chip key={m.templateId}>
                {m.pattern} <span className="text-muted">연속 {m.streak}번</span>
              </Chip>
            ))}
          </Box>
        </div>
      )}
    </section>
  );
}

function Box({ title, tone, empty, children }: { title: string; tone: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className={`rounded-2xl p-3 ${tone}`}>
      <div className="mb-2 text-xs font-semibold text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children.length ? children : <span className="text-xs text-muted">{empty}</span>}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs">{children}</span>;
}

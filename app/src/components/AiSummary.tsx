"use client";

import { useEffect, useState } from "react";
import type { StudentSummary } from "@/lib/types";

type State = { summary: StudentSummary | null; stale: boolean; available: number };

const PRIORITY = {
  높음: "bg-salmon-soft text-[#b5624f]",
  보통: "bg-honey-soft text-olive",
  낮음: "bg-sage-soft text-[#5d7a50]",
};

// 학생별 AI 학습 요약 (Solar Pro 4): 요약 문단만 보이고, 확인할 개념·주의할 점은 접어 둔다
export default function AiSummary({
  studentId,
  refreshKey,
  onMakeSupplement,
}: {
  studentId: string;
  refreshKey?: number;
  onMakeSupplement?: () => void;
}) {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/students/${studentId}/summary`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [studentId, refreshKey]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/students/${studentId}/summary`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError((e as Error).message || "요약하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const canRun = (data?.available ?? 0) > 0;

  return (
    <section className="rounded-3xl border border-honey/60 bg-paper p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">AI 학습 요약</h2>
        {s && <span className="text-xs text-muted">풀이 {s.basedOn}개 기준</span>}
        {data?.stale && <span className="rounded-full bg-honey px-2 py-0.5 text-xs font-semibold">새 풀이 있음</span>}
        {/* 풀이가 그대로면 다시 요약해도 같은 결과라 버튼을 숨긴다 (새 풀이가 생기면 다시 보임) */}
        {s && !data?.stale && !busy ? (
          <span className="ml-auto text-xs text-muted">최신 풀이까지 반영됨</span>
        ) : (
        <button
          onClick={generate}
          disabled={busy || !canRun}
          className="ml-auto rounded-full bg-honey px-4 py-2 text-sm font-semibold transition hover:bg-honey-deep disabled:opacity-40"
        >
          {busy ? "정리하는 중…" : s ? "↻ 다시 요약" : "AI로 요약하기"}
        </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-xl bg-salmon-soft px-3 py-2 text-sm text-[#b5624f]">{error}</p>}
      {!canRun && data && <p className="mt-3 text-sm text-muted">분석이 끝난 풀이가 생기면 요약할 수 있어요.</p>}

      {s && (
        <div className={`mt-4 flex flex-col gap-4 text-sm ${busy ? "opacity-50" : ""}`}>
          <p className="rounded-2xl bg-honey-soft/60 p-4 leading-relaxed">{s.overview}</p>

          {(s.weakConcepts.length > 0 || s.cautions.length > 0) && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                {[
                  s.weakConcepts.length ? `확인이 필요한 개념 ${s.weakConcepts.length}개` : "",
                  s.cautions.length ? `직접 확인해 주세요 ${s.cautions.length}개` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {s.weakConcepts.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {s.weakConcepts.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-xl border border-line p-3">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY[w.priority]}`}>{w.priority}</span>
                        <div>
                          <b>{w.concept}</b>
                          <div className="mt-0.5 text-muted">{w.evidence}</div>
                          {/* 근거: 실제 풀이에서 가져온 틀린 줄 */}
                          {!!w.proofs?.length && (
                            <ul className="mt-2 flex flex-col gap-1.5">
                              {w.proofs.map((p) => (
                                <li key={p.submissionId} className="rounded-lg bg-honey-soft/40 px-2.5 py-1.5 text-xs">
                                  <div className="text-muted">
                                    {p.question}
                                    {p.teacherChecked && <span className="ml-1 text-olive">· 선생님 확인</span>}
                                  </div>
                                  {/* 학생이 실제로 쓴 풀이: 틀린 줄 주변만 잘라 빨간 테두리로 표시 (누르면 원본 전체) */}
                                  <a href={`/api/submissions/${p.submissionId}/image`} target="_blank" rel="noreferrer" title="원본 풀이 전체 보기" className="mt-1.5 block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/api/submissions/${p.submissionId}/image?focus=error`}
                                      alt="학생이 쓴 풀이 (틀린 줄 표시)"
                                      loading="lazy"
                                      onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
                                      className="max-h-40 w-auto max-w-full rounded-md border border-line bg-white"
                                    />
                                  </a>
                                  <div className="mt-1.5 font-mono">
                                    <span className="mr-1 font-sans text-muted">AI가 읽은 줄</span>
                                    {p.prevLine && <span className="text-muted">{p.prevLine} → </span>}
                                    <span className="font-semibold text-[#b5624f]">{p.wrongLine}</span>
                                  </div>
                                  {p.reason && <div className="mt-0.5 text-muted">{p.reason}</div>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {s.cautions.length > 0 && (
                  <div className="rounded-xl border border-dashed border-[#b5624f]/40 bg-salmon-soft/40 p-3">
                    <h3 className="mb-1 text-xs font-semibold text-[#b5624f]">직접 확인해 주세요</h3>
                    <ul className="list-disc pl-5 text-muted">
                      {s.cautions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
          {onMakeSupplement && (
            <button
              onClick={onMakeSupplement}
              className="self-end rounded-full bg-sage px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4d6842]"
            >
              보충 문항 만들기 →
            </button>
          )}
          <p className="text-xs text-muted">AI 요약은 참고용이에요. 최종 판단과 지도 내용은 선생님이 정해 주세요.</p>
        </div>
      )}
    </section>
  );
}


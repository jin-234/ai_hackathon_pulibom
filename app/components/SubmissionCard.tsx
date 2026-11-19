"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Analysis } from "@/lib/analyze";
import type { OcrAttempt } from "@/lib/ocr";
import { ERROR_TYPES, OCR_ENGINE_LABEL, STATUS_LABEL, conceptLabel, errorLabel } from "@/lib/constants";
import { fmtSec } from "@/lib/stats";

export type SubmissionView = {
  id: string;
  imageUrl: string | null;
  final_answer: string | null;
  is_correct: boolean | null;
  duration_sec: number | null;
  stroke_count: number;
  erase_count: number;
  away_sec: number;
  status: string;
  ocr_engine: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  ocr_attempts: OcrAttempt[];
  analysis: Analysis | null;
  error_type: string | null;
  concept: string | null;
  error_message: string | null;
  teacher_error_type: string | null;
  teacher_note: string | null;
  reviewed: boolean;
  is_demo: boolean;
  created_at: string;
  problem: { content: string; answer: string; concept: string };
  assignment: { title: string; kind: string };
};

const statusColor: Record<string, string> = {
  pending: "bg-paper text-ink-soft",
  processing: "bg-warn-soft",
  done: "bg-leaf-soft text-leaf",
  needs_review: "bg-warn-soft",
  error: "bg-alert-soft text-alert",
};

export default function SubmissionCard({ s }: { s: SubmissionView }) {
  const router = useRouter();
  const [errType, setErrType] = useState(s.teacher_error_type ?? "");
  const [note, setNote] = useState(s.teacher_note ?? "");
  const [busy, setBusy] = useState(false);
  const a = s.analysis;
  const effective = s.teacher_error_type ?? s.error_type;

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    await fetch(`/api/submissions/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_error_type: errType || null, teacher_note: note, ...extra }),
    });
    setBusy(false);
    router.refresh();
  };

  const reanalyze = async () => {
    setBusy(true);
    await fetch(`/api/submissions/${s.id}/analyze`, { method: "POST" });
    setBusy(false);
    router.refresh();
  };

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-5 py-3 text-sm">
        <span className="text-ink-soft">{s.assignment.title}</span>
        <span className="font-serif text-base font-semibold">{s.problem.content}</span>
        <span className={`chip ${s.is_correct ? "bg-leaf-soft text-leaf" : "bg-alert-soft text-alert"}`}>
          x = {s.final_answer || "?"} {s.is_correct ? "정답" : `오답 (정답 ${s.problem.answer})`}
        </span>
        <span className={`chip ${statusColor[s.status] ?? ""}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
        {s.reviewed && <span className="chip bg-leaf-soft text-leaf">교사 확인</span>}
        {s.is_demo && <span className="chip bg-paper text-ink-soft">가상 데이터</span>}
        <span className="ml-auto text-xs text-ink-soft">
          {fmtSec(s.duration_sec)} · 획 {s.stroke_count} · 지움 {s.erase_count}
          {s.away_sec > 0 && ` · 화면 이탈 ${fmtSec(s.away_sec)}`}
        </span>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-ink-soft">원본 풀이</div>
          {s.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.imageUrl} alt="학생 풀이" className="mt-2 w-full rounded-xl border border-line bg-white" />
          ) : (
            <div className="mt-2 grid h-40 place-items-center rounded-xl border border-dashed border-line text-sm text-ink-soft">
              이미지 없음 (가상 데이터)
            </div>
          )}

          {(s.ocr_engine || s.ocr_attempts?.length > 0) && (
            <div className="mt-3 text-xs">
              <div className="font-semibold text-ink-soft">
                손글씨 인식 {s.ocr_engine && `· ${OCR_ENGINE_LABEL[s.ocr_engine] ?? s.ocr_engine}`}
                {s.ocr_confidence != null && ` · 신뢰도 ${s.ocr_confidence.toFixed(2)}`}
              </div>
              {s.ocr_text && s.ocr_engine !== "demo" && (
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-paper p-2 font-mono">{s.ocr_text}</pre>
              )}
              {s.ocr_attempts?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.ocr_attempts.map((t, i) => (
                    <span
                      key={i}
                      title={t.reason}
                      className={`chip ${t.ok ? "bg-leaf-soft text-leaf" : "bg-alert-soft text-alert"}`}
                    >
                      {OCR_ENGINE_LABEL[t.engine] ?? t.engine} {t.ok ? "✓" : `✗ ${t.reason ?? ""}`.slice(0, 40)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 text-sm">
          {s.status === "pending" || s.status === "processing" ? (
            <div className="rounded-xl bg-warn-soft p-4">🔄 AI가 풀이를 살펴보는 중이에요…</div>
          ) : null}
          {s.error_message && <div className="rounded-xl bg-alert-soft p-3 text-alert">{s.error_message}</div>}

          {a && (
            <>
              {a.steps?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink-soft">풀이 단계</div>
                  <ol className="mt-2 space-y-1">
                    {a.steps.map((st, i) => (
                      <li
                        key={i}
                        className={`flex gap-2 rounded-lg px-2 py-1 ${
                          a.first_error_step === i + 1 ? "bg-alert-soft" : st.ok ? "" : "bg-warn-soft"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-ink-soft">{i + 1}</span>
                        <span className="font-mono">{st.line}</span>
                        <span className="ml-auto text-xs text-ink-soft">{st.ok ? "✓" : st.note}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${effective === "none" ? "bg-leaf-soft text-leaf" : "bg-alert-soft text-alert"}`}>
                    {errorLabel(effective)}
                  </span>
                  {s.teacher_error_type && <span className="text-xs text-ink-soft">(AI: {errorLabel(s.error_type)})</span>}
                  {a.first_error_step > 0 && <span className="text-xs text-ink-soft">{a.first_error_step}번째 줄에서 처음 오류</span>}
                  <span className="ml-auto text-xs text-ink-soft">확신도 {Math.round((a.confidence ?? 0) * 100)}%</span>
                </div>
                <p className="mt-2">{a.reason}</p>
                {a.suggestion && (
                  <p className="mt-2 text-ink-soft">
                    <b className="text-ink">지도 제안</b> {a.suggestion}
                  </p>
                )}
                {a.check_question && (
                  <p className="mt-1 text-ink-soft">
                    <b className="text-ink">확인 질문</b> {a.check_question}
                  </p>
                )}
                {s.concept && <p className="mt-1 text-xs text-ink-soft">관련 개념: {conceptLabel(s.concept)}</p>}
              </div>
            </>
          )}

          <div className="rounded-xl bg-paper p-4">
            <div className="text-xs font-semibold text-ink-soft">교사 확인</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={errType}
                onChange={(e) => setErrType(e.target.value)}
                className="rounded-lg border border-line bg-card px-2 py-1.5"
              >
                <option value="">AI 판정 유지</option>
                {ERROR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {errorLabel(t)}
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="이 풀이에 대한 메모"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1.5"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => save({ reviewed: true })}>
                확인 완료
              </button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => save()}>
                저장
              </button>
              {!s.is_demo && (
                <button type="button" className="btn-ghost ml-auto" disabled={busy} onClick={reanalyze}>
                  재분석
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

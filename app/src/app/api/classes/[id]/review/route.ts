import { NextResponse } from "next/server";
import { listAssignments } from "@/lib/assignments";
import { classMembers } from "@/lib/classes";
import { listSubmissions } from "@/lib/store";
import { requireOwnClass } from "../shared";

export const runtime = "nodejs";

// 교사가 확인할 풀이 모음 (반 전체): AI 가 판독하기 어려웠던 풀이(needs_review) · AI 분석이 실패한 풀이(error) 중 아직 확인 안 한 것
//  이 반의 공개된 과제 풀이만 (대시보드 '확인할 풀이' 수와 같은 기준). 보관된 반이면 읽기 전용
//  ?assignment=과제ID 면 그 과제 풀이만, ?from=&to= (ms) 면 그 기간에 제출한 풀이만 (오늘의 교실 위쪽 거르기와 같게)
const ms = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const q = new URL(req.url).searchParams;
  const only = q.get("assignment");
  const from = ms(q.get("from"));
  const to = ms(q.get("to"));
  const g = await requireOwnClass((await params).id, { write: false });
  if ("error" in g) return g.error;
  const [assignments, roster, subs] = await Promise.all([listAssignments({ classIds: [g.cls.id] }), classMembers(g.cls.id), listSubmissions()]);
  // 문항 id → 문제 (예전 풀이는 문제 글이 저장돼 있지 않아 과제에서 채운다)
  const problems = new Map(assignments.filter((a) => a.published && (!only || a.id === only)).flatMap((a) => a.problems.map((p) => [p.id, p.question] as const)));
  const names = new Map(roster.map((s) => [s.id, s.name]));
  // 학생·문항마다 최신 풀이만 (다시 풀었으면 예전 풀이는 확인할 필요 없음. 대시보드 '확인할 풀이' 수와 같은 기준)
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    if (!names.has(s.studentId) || !problems.has(s.problemId)) continue;
    if ((from !== undefined && s.submittedAt < from) || (to !== undefined && s.submittedAt > to)) continue;
    const key = `${s.studentId}:${s.problemId}`;
    if (!latest.has(key) || latest.get(key)!.submittedAt < s.submittedAt) latest.set(key, s);
  }
  const list = [...latest.values()]
    .filter((s) => (s.status === "needs_review" || s.status === "error") && !s.teacher?.confirmedAt)
    .sort((a, b) => b.submittedAt - a.submittedAt)
    // 목록에서는 무거운 필드(필기 획·OCR 원본) 제외
    .map((s) => ({ ...s, question: s.question || problems.get(s.problemId) || "", strokes: [], ocrRaw: undefined, studentName: names.get(s.studentId) ?? s.studentId, readOnly: g.cls.archived }));
  return NextResponse.json({ submissions: list });
}

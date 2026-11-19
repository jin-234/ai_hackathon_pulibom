import { NextResponse } from "next/server";
import { requireStudentAccess } from "@/lib/guard";
import { generateSummary, getSummary } from "@/lib/summary";

export const runtime = "nodejs";

// AI 학습 요약은 지난 학년 기록까지 묶어서 만들므로 지금 담당 반 학생만

// 저장된 요약 (+ 새 풀이가 생겼는지)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  return NextResponse.json(await getSummary(id));
}

// AI로 새로 요약
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  try {
    const summary = await generateSummary(id);
    return NextResponse.json({ summary, stale: false, available: summary.basedOn });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

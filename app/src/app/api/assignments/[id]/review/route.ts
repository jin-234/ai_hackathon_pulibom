import { NextResponse } from "next/server";
import { requireOwnAssignment } from "@/lib/guard";
import { reviewSupplement } from "@/lib/supplement";

export const runtime = "nodejs";

// 보충 과제 AI 변화 분석 (보충 전 오답 vs 보충 후 풀이)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnAssignment(id, { write: true });
  if ("error" in g) return g.error;
  try {
    const body = (await req.json().catch(() => ({}))) as { studentId?: string };
    return NextResponse.json(await reviewSupplement(id, body.studentId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

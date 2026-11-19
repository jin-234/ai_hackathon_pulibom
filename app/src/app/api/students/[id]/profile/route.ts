import { NextResponse } from "next/server";
import { requireStudentAccess } from "@/lib/guard";
import { getProfile } from "@/lib/learningProfile";

export const runtime = "nodejs";

// 학습 프로필: 남은 약점·극복한 오류·익힌 틀·잘하는 개념 (다음 보충 문제 선택에 반영되는 것)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  try {
    return NextResponse.json(await getProfile(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

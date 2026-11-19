import { NextResponse } from "next/server";
import { requireStudentAccess } from "@/lib/guard";
import { draftSupplement, supplementCount } from "@/lib/supplement";

export const runtime = "nodejs";

// 보충 문항 후보 만들기 (문제은행 틀마다 하나씩 → AI 다른 모양·문장제 → 숫자 바꾸기, 풀이기 검증). 저장하지 않고 교사 확인용으로 돌려준다
// body: { count } 문항 수 (1~10, 기본 3)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireStudentAccess(id, { current: true });
  if ("error" in g) return g.error;
  try {
    const body = (await req.json().catch(() => ({}))) as { count?: unknown };
    return NextResponse.json(await draftSupplement(id, supplementCount(body.count, 3)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

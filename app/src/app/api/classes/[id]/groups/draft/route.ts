import { NextResponse } from "next/server";
import { draftGroupSupplement, supplementCount } from "@/lib/supplement";
import { asErrorType, requireGroup } from "../shared";

export const runtime = "nodejs";

// 소그룹 보충 문항 후보 (문제은행 틀마다 하나씩 → AI 다른 모양·문장제 → 숫자 바꾸기). 저장하지 않고 교사 확인용으로 돌려준다
// body: { studentIds, targetError, concept, count } (count 1~10, 기본 4)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { studentIds?: unknown; targetError?: unknown; concept?: unknown; count?: unknown };
  const g = await requireGroup(id, body.studentIds);
  if ("error" in g) return g.error;
  try {
    return NextResponse.json(
      await draftGroupSupplement(g.studentIds, {
        targetError: asErrorType(body.targetError),
        concept: typeof body.concept === "string" ? body.concept : null,
      }, supplementCount(body.count, 4)),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

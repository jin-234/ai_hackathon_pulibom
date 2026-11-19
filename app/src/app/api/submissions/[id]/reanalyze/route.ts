import { NextResponse } from "next/server";
import { canEditSubmission } from "@/lib/classes";
import { requireStudentAccess } from "@/lib/guard";
import { runPipeline } from "@/lib/pipeline";
import { getSubmission, readImage, updateSubmission } from "@/lib/store";

export const runtime = "nodejs";

// 저장된 풀이 이미지로 OCR·분석을 다시 실행 (프롬프트 개선 후 재확인 등). 지난 학년 기록은 그대로 둔다
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) return NextResponse.json({ error: "없음" }, { status: 404 });
  const g = await requireStudentAccess(s.studentId, { current: false });
  if ("error" in g) return g.error;
  if (!canEditSubmission(g.access, s)) return NextResponse.json({ error: "지난 학년 기록은 다시 분석할 수 없어요." }, { status: 403 });
  const png = await readImage(id);
  if (!png) return NextResponse.json({ error: "풀이 이미지가 없어요." }, { status: 404 });
  const next = await updateSubmission(id, { status: "pending", statusMessage: undefined, analysis: undefined, ocrLines: [] });
  void runPipeline(next!, png);
  return NextResponse.json({ id });
}

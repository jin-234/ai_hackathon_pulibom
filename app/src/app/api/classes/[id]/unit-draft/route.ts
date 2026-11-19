import { NextResponse } from "next/server";
import { draftUnitProblems } from "@/lib/unitProblems";
import { requireOwnClass } from "../shared";

export const runtime = "nodejs";

// 교육과정 소단원 문항 초안 { lessonId, count, mode: "bank" | "ai", type: "choice" | "written" }. 반의 학년 교육과정 안에서만. 저장하지 않고 교사 확인용으로 돌려준다
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireOwnClass((await params).id, { write: true });
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { lessonId?: unknown; count?: unknown; mode?: unknown; type?: unknown };
  const count = Math.min(10, Math.max(1, Math.round(Number(body.count) || 5)));
  try {
    if (typeof body.lessonId !== "string") throw new Error("단원을 골라 주세요.");
    return NextResponse.json(await draftUnitProblems(g.cls.grade, body.lessonId, count, body.mode === "ai" ? "ai" : "bank", body.type === "choice" ? "choice" : "written"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

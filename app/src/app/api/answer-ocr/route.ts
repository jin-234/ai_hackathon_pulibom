import { NextResponse } from "next/server";
import { hasUpstageKey } from "@/lib/ai";
import { findProblemWithAssignment } from "@/lib/assignments";
import { ocrFromStrokes } from "@/lib/ocrImage";
import { getSession } from "@/lib/session";
import { variableOf, type Stroke } from "@/lib/types";

export const runtime = "nodejs";

const MAX_STROKES = 60;

// 답안 칸 손글씨 읽기: 풀이 OCR 과 같은 방식으로 읽어 한 줄 글자로 돌려준다
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "student") return NextResponse.json({ error: "학생으로 로그인해 주세요." }, { status: 401 });
  if (!hasUpstageKey()) return NextResponse.json({ error: "글씨 인식을 쓸 수 없어요. 직접 입력해 주세요." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { problemId?: string; strokes?: Stroke[] } | null;
  if (!body?.problemId || !Array.isArray(body.strokes) || body.strokes.length === 0)
    return NextResponse.json({ error: "읽을 글씨가 없어요." }, { status: 400 });
  const found = await findProblemWithAssignment(body.problemId);
  if (!found) return NextResponse.json({ error: "알 수 없는 문항" }, { status: 400 });
  try {
    const ocr = await ocrFromStrokes(body.strokes.slice(0, MAX_STROKES), variableOf(found.problem));
    return NextResponse.json({ text: (ocr?.lines ?? []).join(" ").trim() });
  } catch {
    return NextResponse.json({ error: "글씨를 못 읽었어요. 다시 쓰거나 터치해서 입력해 주세요." }, { status: 502 });
  }
}

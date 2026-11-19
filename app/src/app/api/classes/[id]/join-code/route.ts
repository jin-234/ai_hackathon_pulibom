import { NextResponse } from "next/server";
import { teacherClass } from "@/lib/classes";
import { requireTeacher } from "@/lib/guard";
import { getJoinCode, regenerateJoinCode } from "@/lib/signup";

export const runtime = "nodejs";

async function ownClass(id: string) {
  const t = await requireTeacher();
  if ("error" in t) return t;
  const cls = await teacherClass(t.session.id, id);
  if (!cls) return { error: NextResponse.json({ error: "담당 반이 아니에요." }, { status: 403 }) };
  return { cls };
}

// 반 코드 보기 (보관된 반은 가입을 받지 않으니 코드도 안 보여 줌)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await ownClass((await params).id);
  if ("error" in g) return g.error;
  if (g.cls.archived) return NextResponse.json({ code: null });
  try {
    return NextResponse.json({ code: (await getJoinCode(g.cls.id)) ?? (await regenerateJoinCode(g.cls.id)) });
  } catch {
    return NextResponse.json({ error: "반 코드가 아직 없어요. npm run db:setup 을 실행해 주세요." }, { status: 503 });
  }
}

// 반 코드 새로 만들기 (이미 가입한 학생은 그대로)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await ownClass((await params).id);
  if ("error" in g) return g.error;
  if (g.cls.archived) return NextResponse.json({ error: "보관된 반은 가입을 받지 않아요." }, { status: 403 });
  try {
    return NextResponse.json({ code: await regenerateJoinCode(g.cls.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

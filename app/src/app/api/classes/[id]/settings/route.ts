import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS, validateSettings } from "@/lib/classSettings";
import { getClassSettings, saveClassSettings } from "@/lib/settings";
import { requireOwnClass } from "../shared";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// 반 설정 + 기본값 (설정 화면용)
export async function GET(_req: Request, { params }: Ctx) {
  const g = await requireOwnClass((await params).id, { write: false });
  if ("error" in g) return g.error;
  return NextResponse.json({ settings: await getClassSettings(g.cls.id), defaults: DEFAULT_SETTINGS });
}

// 반 설정 저장 { mastery } (보관된 반은 못 고침)
export async function PUT(req: Request, { params }: Ctx) {
  const g = await requireOwnClass((await params).id, { write: true });
  if ("error" in g) return g.error;
  try {
    const settings = validateSettings(await req.json().catch(() => null));
    try {
      await saveClassSettings(g.cls.id, settings);
    } catch {
      throw new Error("설정 테이블이 아직 없어요. npm run db:setup 을 실행해 주세요.");
    }
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { resolveTeacherClass } from "@/lib/classes";
import { computeClassStats } from "@/lib/classStats";
import { requireTeacher } from "@/lib/guard";

export const runtime = "nodejs";

// 숫자(ms)면 그 값, 아니면 없음
const ms = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

// 학급 대시보드 지표 (실제 제출 기준). ?class=반ID (없으면 첫 담당 반), ?assignment=과제ID 로 과제별
// ?from=&to= (ms) 로 그 기간에 제출한 풀이만
export async function GET(req: Request) {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  const params = new URL(req.url).searchParams;
  try {
    const cls = await resolveTeacherClass(t.session.id, params.get("class"));
    if (!cls) return NextResponse.json({ error: "담당 반이 없어요." }, { status: 404 });
    const period = { from: ms(params.get("from")), to: ms(params.get("to")) };
    if (period.from !== undefined && period.to !== undefined && period.from > period.to)
      return NextResponse.json({ error: "기간의 시작이 끝보다 늦어요." }, { status: 400 });
    return NextResponse.json(await computeClassStats(cls, params.get("assignment") || null, period));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

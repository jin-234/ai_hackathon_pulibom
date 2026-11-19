import { canSeeSubmission } from "@/lib/classes";
import { requireStudentAccess } from "@/lib/guard";
import { getSession } from "@/lib/session";
import { getSubmission, readScratchImage } from "@/lib/store";

export const runtime = "nodejs";

// 연습장 이미지: 본인 학생, 또는 이 기록을 볼 수 있는 교사만 (AI 는 읽지 않는다)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) return new Response("없음", { status: 404 });
  const session = await getSession();
  if (!(session?.role === "student" && session.id === s.studentId)) {
    const g = await requireStudentAccess(s.studentId, { current: false });
    if ("error" in g) return g.error;
    if (!canSeeSubmission(g.access, s)) return new Response("볼 수 없는 기록이에요.", { status: 403 });
  }
  const png = await readScratchImage(id);
  if (!png) return new Response("없음", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}

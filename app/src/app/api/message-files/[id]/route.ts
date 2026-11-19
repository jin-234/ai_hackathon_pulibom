import { timingSafeEqual } from "crypto";
import { requireStudentAccess } from "@/lib/guard";
import { readMessageFile } from "@/lib/messages";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// 메시지로 보낸 파일 내려받기
//  ?t=<token>: 파일마다 만든 추측할 수 없는 값 (아이패드 앱이 로그인 쿠키 없이 Safari 로 열 때)
//  token 이 없으면 로그인으로: 받은 학생 본인, 또는 그 학생 기록을 볼 수 있는 선생님
// 올린 파일이 이 사이트에서 스크립트로 돌지 않게: 바로 보여 줘도 되는 것(PDF·그림·영상·소리)만 inline, 나머지는 내려받기 + 실행 막기
const INLINE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|webm))$/;

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await readMessageFile(id);
  if (!f) return new Response("없음", { status: 404 });
  const t = new URL(req.url).searchParams.get("t") ?? "";
  let ok = !!t && sameToken(t, f.token);
  if (!ok) {
    const session = await getSession();
    if (session?.role === "student") ok = session.id === f.student_id;
    else if (session?.role === "teacher") {
      const g = await requireStudentAccess(f.student_id, { current: false });
      ok = !("error" in g); // 메시지를 읽을 수 있는 선생님 (지난 학년 담임 포함)
    }
  }
  if (!ok) return new Response("볼 수 없는 파일이에요.", { status: 403 });
  const inline = INLINE.test(f.mime);
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": inline ? f.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      // PDF 는 빼고 실행 막기 (크롬 내장 PDF 뷰어는 sandbox 가 붙으면 열지 않음. PDF 뷰어는 스크립트를 돌리지 않는다)
      ...(f.mime === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'" }),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

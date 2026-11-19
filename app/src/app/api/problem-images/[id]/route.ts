import { readProblemImage } from "@/lib/problemImages";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// 문제 그림: 로그인한 학생·선생님만 (그림 id 는 추측할 수 없는 값이고, 문제 글과 같은 수준의 정보)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("로그인해 주세요.", { status: 401 });
  const { id } = await params;
  const img = await readProblemImage(id);
  if (!img) return new Response("없음", { status: 404 });
  // 같은 id 의 그림은 바뀌지 않으니 오래 캐시
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" } });
}

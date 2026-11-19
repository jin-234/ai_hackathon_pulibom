import sharp from "sharp";
import { variableOf } from "@/lib/ai";
import { findProblem } from "@/lib/assignments";
import { canSeeSubmission } from "@/lib/classes";
import { requireStudentAccess } from "@/lib/guard";
import { lineBoxesOf } from "@/lib/ocrImage";
import { getSession } from "@/lib/session";
import { getSubmission, readImage } from "@/lib/store";
import type { Submission } from "@/lib/types";

export const runtime = "nodejs";

// 풀이 이미지: 본인 학생, 또는 이 기록을 볼 수 있는 교사만
// ?focus=error : 처음 틀린 줄(과 그 앞 줄)만 잘라서, 틀린 줄에 빨간 표시를 한 이미지 (AI 학습 요약의 근거용)
//                줄 위치를 못 맞추면 원본 전체를 그대로 준다
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSubmission(id);
  if (!s) return new Response("없음", { status: 404 });
  const session = await getSession();
  if (!(session?.role === "student" && session.id === s.studentId)) {
    const g = await requireStudentAccess(s.studentId, { current: false });
    if ("error" in g) return g.error;
    if (!canSeeSubmission(g.access, s)) return new Response("볼 수 없는 기록이에요.", { status: 403 });
  }
  const png = await readImage(id);
  if (!png) return new Response("없음", { status: 404 });
  let out: Buffer = png;
  if (new URL(req.url).searchParams.get("focus") === "error") {
    try {
      out = (await focusError(s, png)) ?? png;
    } catch {
      out = png;
    }
  }
  return new Response(new Uint8Array(out), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}

async function focusError(s: Submission, png: Buffer): Promise<Buffer | null> {
  const i = s.analysis?.firstErrorLine;
  if (typeof i !== "number") return null;
  const problem = await findProblem(s.problemId);
  const boxes = lineBoxesOf(s.strokes, problem ? variableOf(problem) : "x");
  // OCR 줄과 획 줄 수가 같을 때만 번호가 맞는다 (못 읽은 줄이 빠졌으면 어긋날 수 있음)
  if (boxes.length !== s.ocrLines.length || !boxes[i]) return null;
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 1000;
  const H = meta.height ?? 680;
  const wrong = boxes[i];
  const shown = i > 0 ? [boxes[i - 1], wrong] : [wrong];
  const gh = Math.max(wrong.y1 - wrong.y0, 20);
  const pad = Math.round(gh * 0.6);
  const left = Math.max(0, Math.floor(Math.min(...shown.map((b) => b.x0)) - pad));
  const top = Math.max(0, Math.floor(Math.min(...shown.map((b) => b.y0)) - pad));
  const right = Math.min(W, Math.ceil(Math.max(...shown.map((b) => b.x1)) + pad));
  const bottom = Math.min(H, Math.ceil(wrong.y1 + pad));
  const w = right - left;
  const h = bottom - top;
  if (w < 4 || h < 4) return null;
  // 틀린 줄: 연한 빨강 바탕 + 테두리
  const m = Math.round(pad * 0.5);
  const rx = Math.max(0, wrong.x0 - left - m);
  const ry = Math.max(0, wrong.y0 - top - m);
  const rw = Math.min(w - rx, wrong.x1 - wrong.x0 + 2 * m);
  const rh = Math.min(h - ry, wrong.y1 - wrong.y0 + 2 * m);
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="10" fill="#f3a48f" fill-opacity="0.22" stroke="#d0614a" stroke-width="3"/></svg>`;
  return sharp(png)
    .extract({ left, top, width: w, height: h })
    .composite([{ input: Buffer.from(overlay), blend: "over" }])
    .png()
    .toBuffer();
}

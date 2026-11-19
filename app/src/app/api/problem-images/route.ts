import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/guard";
import { saveProblemImage } from "@/lib/problemImages";

export const runtime = "nodejs";

// 선생님이 문제 그림을 올린다 (form-data 'file'). 돌려주는 id 를 문항 figure 에 { type: "image", imageId } 로 넣는다
export async function POST(req: Request) {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "그림 파일을 골라 주세요." }, { status: 400 });
    return NextResponse.json({ id: await saveProblemImage(t.session.id, file) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

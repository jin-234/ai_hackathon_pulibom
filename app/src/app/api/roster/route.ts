import { NextResponse } from "next/server";
import { getRoster } from "@/lib/roster";

// 로그인용 학생 명단 (아이패드 앱 로그인 화면). 웹 로그인 화면의 반·번호 목록과 같은 내용
export async function GET() {
  try {
    const students = (await getRoster()).map(({ id, number, name, classId, className }) => ({ id, number, name, classId, className }));
    return NextResponse.json({ students });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/guard";
import { realtimeConfig } from "@/lib/realtime";

export const runtime = "nodejs";

// 선생님 화면의 실시간 새로고침 설정 (Supabase 주소 + anon 키). 설정이 없으면 { url: null } → 화면은 폴링으로 동작
//  루트 .env 는 서버에서만 읽혀서(env.ts) 브라우저에 NEXT_PUBLIC_ 로 넘길 수 없어 API 로 준다
export async function GET() {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  return NextResponse.json(realtimeConfig() ?? { url: null, key: null });
}

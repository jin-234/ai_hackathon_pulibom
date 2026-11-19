import { NextResponse } from "next/server";
import { enqueueAnalysis } from "@/lib/analyze";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

// 재분석
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await db()
    .from("submissions")
    .update({ status: "pending", error_message: null })
    .eq("id", id)
    .not("image_path", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  enqueueAnalysis(id);
  return NextResponse.json({ ok: true });
}

import Link from "next/link";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 데모용: 로그인 대신 학생 선택
export default async function StudentPick() {
  const { data: students, error } = await db().from("students").select("id, name, number").order("number");
  if (error) return <main className="p-8 text-alert">DB 오류: {error.message}</main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">누구인가요?</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {students?.map((s) => (
          <Link key={s.id} href={`/student/${s.id}`} className="card p-5 text-center hover:shadow-md">
            <div className="text-xs text-ink-soft">{s.number}번</div>
            <div className="mt-1 text-lg font-bold">{s.name}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { use } from "react";
import StudentDetail from "@/components/StudentDetail";

export default function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = use(params);
  const { tab } = use(searchParams);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/teacher" className="text-sm text-muted hover:underline">← 오늘의 교실</Link>
      <StudentDetail key={`${id}-${tab ?? ""}`} id={id} start={tab === "messages" ? { tab: "messages" } : undefined} />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 분석 중인 제출이 있으면 5초마다 서버 데이터 새로고침
export default function AutoRefresh({ active, ms = 5000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}

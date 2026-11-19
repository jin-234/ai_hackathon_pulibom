"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORT_COOKIE, SORT_LABEL, type SortKey } from "@/lib/studentSort";

// 학생 과제 목록 정렬 고르기. 고른 값은 쿠키에 남겨서 문제를 풀고 돌아와도 그대로
export default function SortPicker({ value, options }: { value: SortKey; options: SortKey[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();

  const pick = (k: SortKey) => {
    document.cookie = `${SORT_COOKIE}=${k}; path=/; max-age=31536000; samesite=lax`;
    const q = new URLSearchParams(params);
    q.set("sort", k);
    router.replace(`${path}?${q}`, { scroll: false });
  };

  return (
    <div role="radiogroup" aria-label="정렬" className="flex shrink-0 gap-1 rounded-full bg-sand p-1 text-sm">
      {options.map((k) => (
        <button
          key={k}
          role="radio"
          aria-checked={value === k}
          onClick={() => value !== k && pick(k)}
          className={`rounded-full px-3 py-1.5 ${value === k ? "bg-paper font-semibold text-ink shadow-sm" : "text-muted"}`}
        >
          {SORT_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

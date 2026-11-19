"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-sand hover:text-ink"
    >
      로그아웃
    </button>
  );
}

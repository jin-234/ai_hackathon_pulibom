"use client";

import { useRef, useState } from "react";
import FigureView from "@/components/FigureView";
import type { Figure } from "@/lib/figure";

// 출제·보충 문항의 그림: AI 가 만든 그림 미리보기 + 선생님이 그림 파일 올리기 / 빼기
export function FigureEditor({ figure, onChange }: { figure?: Figure; onChange: (f: Figure | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/problem-images", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      onChange({ type: "image", imageId: d.id, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 60) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {figure && <FigureView figure={figure} />}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="rounded-full border border-line px-2.5 py-1 text-muted hover:bg-sand disabled:opacity-50"
        >
          {busy ? "올리는 중…" : figure ? "🖼 다른 그림으로 바꾸기" : "🖼 그림 올리기"}
        </button>
        {figure && (
          <button type="button" onClick={() => onChange(undefined)} className="rounded-full px-2.5 py-1 text-muted hover:bg-sand">
            그림 빼기
          </button>
        )}
        {figure && figure.type !== "image" && <span className="text-muted">AI가 좌표로 만든 그림이에요. 문제와 맞는지 확인해 주세요</span>}
        {error && <span className="text-[#b5624f]">{error}</span>}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

// 교사가 고른 반: 오늘의 교실·과제 출제 화면이 같이 쓴다 (브라우저에 기억, ?class= 로도 지정 가능)
export type TeacherClass = { id: string; name: string; grade: number; schoolYear: number; archived: boolean; label: string };

const KEY = "pulibom.teacherClass";

const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function useTeacherClass(opts: { initial?: string | null; currentOnly?: boolean } = {}) {
  const { initial = null, currentOnly = false } = opts;
  const [classes, setClasses] = useState<TeacherClass[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [error, setError] = useState("");

  const reload = useCallback(
    () =>
      fetch("/api/classes")
        .then((r) => r.json())
        .then((d) => {
          if (!Array.isArray(d)) throw new Error(d.error ?? "반 목록을 불러오지 못했어요.");
          setClasses(d);
          setError("");
        })
        .catch((e) => setError((e as Error).message)),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const usable = (classes ?? []).filter((c) => !currentOnly || !c.archived);
  const wanted = selectedId ?? remembered();
  // 고른 반이 목록에 없으면 첫 번째 반 (올해 반이 앞에 온다)
  const selected = usable.find((c) => c.id === wanted) ?? usable[0];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // 저장이 막힌 브라우저면 이번 화면에서만 기억
    }
  }, []);

  return { classes: usable, selected, select, reload, loading: classes === null && !error, error };
}

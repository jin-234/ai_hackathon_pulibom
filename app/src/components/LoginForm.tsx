"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Chick from "@/components/Chick";
import { DEMO_STUDENT_PASSWORD, DEMO_TEACHER, HOME_OF, type Role, type Session } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";



export default function LoginForm({
  current,
  roster,
  dbError,
  app,
}: {
  current: Session | null;
  roster: { id: string; number: number | null; name: string; classId: string; className: string }[];
  dbError?: string;
  // 학생용 아이패드 앱에서 열림 → 학생 로그인만, 웹 브라우저 → 선생님 로그인만
  app?: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const role: Role = app ? "student" : "teacher";
  const [id, setId] = useState("");
  // 학생: 반을 먼저 고르고 → 그 반 학생 중에서 번호를 고른다
  const classes = [...new Map(roster.map((s) => [s.classId, s.className])).entries()];
  const [classId, setClassId] = useState(roster[0]?.classId ?? "");
  const inClass = roster.filter((s) => s.classId === classId);
  const [studentId, setStudentId] = useState(roster[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (skip: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, skip, id: role === "teacher" ? id.trim() : studentId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const next = params.get("next");
      router.replace(next && next.startsWith(data.home) ? next : data.home);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "로그인에 실패했어요.");
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex flex-col items-center gap-2">
          <Chick size={72} pose="sprout" />
          <span className="text-2xl font-extrabold">
            풀이봄<span className="text-honey-deep">.</span>
          </span>
          <span className="text-sm text-muted">풀이를 모아, 배움을 잇다</span>
        </Link>

        {dbError && <div className="mb-4 rounded-2xl bg-salmon-soft px-4 py-3 text-sm text-[#b5624f]">{dbError}</div>}
        {current && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sage/40 bg-sage-soft px-4 py-3 text-sm">
            <span className="flex-1">
              <b>{current.name}</b>({current.role === "teacher" ? "선생님" : "학생"})으로 로그인돼 있어요.
            </span>
            {!(app && current.role === "teacher") && (
              <Link href={HOME_OF[current.role]} className="rounded-full bg-sage px-3 py-1.5 text-xs font-semibold text-white">
                이어서 하기
              </Link>
            )}
            <LogoutButton />
          </div>
        )}

        <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_8px_30px_rgba(120,100,40,0.06)]">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              go(false);
            }}
          >
            {role === "teacher" ? (
              <Field label="아이디">
                <input
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  autoComplete="username"
                  placeholder="아이디"
                  className="input"
                />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="반">
                  <select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setStudentId(roster.find((s) => s.classId === e.target.value)?.id ?? "");
                      setError("");
                    }}
                    className="input"
                  >
                    {classes.map(([cid, name]) => (
                      <option key={cid} value={cid}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="번호">
                  <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
                    {inClass.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number ?? "-"}번 {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field label={role === "teacher" ? "비밀번호" : "비밀번호 (숫자)"}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                inputMode={role === "student" ? "numeric" : undefined}
                placeholder="••••"
                className="input"
              />
            </Field>

            {error && <p className="rounded-xl bg-salmon-soft px-3 py-2 text-sm text-[#b5624f]">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-2xl bg-honey py-3 font-semibold transition hover:bg-honey-deep disabled:opacity-50"
            >
              {busy ? "들어가는 중…" : role === "teacher" ? "교실로 들어가기" : "과제 풀러 가기"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            프로토타입
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={() => go(true)}
            disabled={busy}
            className="w-full rounded-2xl border border-line py-3 text-sm hover:bg-sand disabled:opacity-50"
          >
            로그인 건너뛰고 {role === "teacher" ? "선생님" : "학생"}으로 둘러보기 →
          </button>
        </div>

        {role === "student" && (
          <p className="mt-4 text-center text-sm text-muted">
            처음 왔나요?{" "}
            <Link href="/signup" className="font-semibold text-ink underline underline-offset-2">
              반 코드로 회원가입
            </Link>
          </p>
        )}

        {app ? (
          <p className="mt-4 text-center text-xs leading-relaxed text-muted">
            데모 계정 · 학생 번호 선택 후 <b>{DEMO_STUDENT_PASSWORD}</b>
          </p>
        ) : (
          <p className="mt-4 text-center text-xs leading-relaxed text-muted">
            데모 계정 · 선생님 <b>{DEMO_TEACHER.id}</b>
            {roster.some((s) => s.className === "2학년 1반") && (
              <>
                {" "}또는 <b>teacher2</b>(2학년 1반)
              </>
            )}{" "}
            / <b>{DEMO_TEACHER.password}</b>
          </p>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

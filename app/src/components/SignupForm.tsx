"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Chick from "@/components/Chick";

const clean = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);

// 학생 회원가입: 선생님께 받은 반 코드 + 번호 + 이름 + 비밀번호 → 그 반 학생으로 바로 들어간다
export default function SignupForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(clean(initialCode));
  const [cls, setCls] = useState<{ name?: string; error?: string } | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 코드 6자리를 다 넣으면 어느 반인지 보여 준다
  useEffect(() => {
    if (code.length !== 6) return setCls(null);
    let alive = true;
    fetch(`/api/auth/signup?code=${code}`)
      .then((r) => r.json())
      .then((d) => alive && setCls(d.error ? { error: d.error } : { name: d.className }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code]);

  const mismatch = password2.length > 0 && password !== password2;

  const submit = async () => {
    if (password !== password2) return setError("비밀번호가 서로 달라요.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, number: Number(number), name, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.replace(d.home);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "가입하지 못했어요.");
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
          <span className="text-sm text-muted">학생 회원가입</span>
        </Link>

        <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_8px_30px_rgba(120,100,40,0.06)]">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="반 코드 (선생님께 받은 6자리)">
              <input
                value={code}
                onChange={(e) => setCode(clean(e.target.value))}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="예: K7P2QX"
                className="input font-mono tracking-[0.3em]"
              />
              {cls?.name && <span className="rounded-xl bg-sage-soft px-3 py-1.5 text-xs text-[#5d7a50]">✓ {cls.name}</span>}
              {cls?.error && <span className="rounded-xl bg-salmon-soft px-3 py-1.5 text-xs text-[#b5624f]">{cls.error} 코드를 다시 확인해 주세요.</span>}
            </Field>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <Field label="번호">
                <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="7" className="input" />
              </Field>
              <Field label="이름">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="name" placeholder="홍길동" className="input" />
              </Field>
            </div>
            <Field label="비밀번호 (숫자 4~8자리)">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="••••"
                className="input"
              />
            </Field>
            <Field label="비밀번호 확인">
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="••••"
                className="input"
              />
              {mismatch && <span className="text-xs text-[#b5624f]">비밀번호가 서로 달라요.</span>}
            </Field>

            {error && <p className="rounded-xl bg-salmon-soft px-3 py-2 text-sm text-[#b5624f]">{error}</p>}

            <button
              type="submit"
              disabled={busy || !cls?.name || !number || !name.trim() || password.length < 4 || mismatch}
              className="mt-1 rounded-2xl bg-honey py-3 font-semibold transition hover:bg-honey-deep disabled:opacity-50"
            >
              {busy ? "가입하는 중…" : "가입하고 과제 보러 가기"}
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            가입하면 바로 그 반 학생이 돼요. 다음부터는 로그인 화면에서 반·번호를 고르고 이 비밀번호를 넣으면 돼요.
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          이미 가입했나요?{" "}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            로그인
          </Link>
        </p>
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

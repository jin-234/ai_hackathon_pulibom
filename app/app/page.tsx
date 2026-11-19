import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <p className="text-sm font-semibold text-sun-deep">중1 문자와 식 · 일차방정식</p>
      <h1 className="mt-2 text-4xl font-bold leading-tight">
        풀이를 모아,
        <br />
        배움을 잇다
      </h1>
      <p className="mt-4 text-ink-soft">학생의 작은 막힘이 선생님의 맞춤 지도로 이어집니다.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/student" className="card p-6 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-3xl">✏️</div>
          <h2 className="mt-3 text-xl font-bold">학생으로 풀기</h2>
          <p className="mt-1 text-sm text-ink-soft">태블릿에 손으로 풀이를 쓰고 제출해요.</p>
        </Link>
        <Link href="/teacher" className="card p-6 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-3xl">📊</div>
          <h2 className="mt-3 text-xl font-bold">선생님 대시보드</h2>
          <p className="mt-1 text-sm text-ink-soft">학급의 취약 개념과 반복 오류를 한눈에 봐요.</p>
        </Link>
      </div>
    </main>
  );
}

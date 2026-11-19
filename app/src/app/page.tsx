import Link from "next/link";
import { Suspense } from "react";
import Chick from "@/components/Chick";
import TopNav from "@/components/TopNav";

export default function Home() {
  return (
    <>
      <Suspense>
        <TopNav />
      </Suspense>
      <main className="mx-auto flex max-w-4xl flex-col items-center gap-10 px-4 py-16 text-center">
        <Chick size={96} pose="sprout" />
        <div>
          <div className="eyebrow">✺ Every little step counts</div>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
            풀이를 모아,
            <br />
            <span className="text-olive">배움을 잇다.</span>
          </h1>
          <p className="mt-4 text-muted">학생의 작은 막힘이 선생님의 맞춤 지도로 이어집니다.</p>
        </div>
        <div className="w-full max-w-xs">
          <Link href="/login" className="block rounded-3xl border border-line bg-sage-soft p-6 text-left transition hover:-translate-y-0.5">
            <div className="eyebrow">Teacher</div>
            <div className="mt-2 text-lg font-bold">선생님으로 시작하기 →</div>
            <div className="text-sm text-muted">학급 풀이 분석과 맞춤 지도</div>
          </Link>
        </div>
      </main>
    </>
  );
}

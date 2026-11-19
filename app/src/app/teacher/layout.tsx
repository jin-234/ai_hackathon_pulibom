import { Suspense } from "react";
import TopNav from "@/components/TopNav";
import { getSession } from "@/lib/session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <Suspense>
        <TopNav role="teacher" userName={session?.name} />
      </Suspense>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}

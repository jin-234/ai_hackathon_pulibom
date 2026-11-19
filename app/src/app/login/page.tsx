import { headers } from "next/headers";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { isAppUA } from "@/lib/app";
import { getSession } from "@/lib/session";
import { getRoster } from "@/lib/roster";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const current = await getSession();
  const app = isAppUA((await headers()).get("user-agent"));
  let roster: { id: string; number: number | null; name: string; classId: string; className: string }[] = [];
  let dbError = "";
  try {
    roster = (await getRoster()).map(({ id, number, name, classId, className }) => ({ id, number, name, classId, className }));
  } catch (e) {
    dbError = (e as Error).message;
  }
  return (
    <Suspense>
      <LoginForm current={current} roster={roster} dbError={dbError} app={app} />
    </Suspense>
  );
}

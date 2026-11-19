import SignupForm from "@/components/SignupForm";

export const dynamic = "force-dynamic";

// 학생 회원가입 (반 코드). /signup?code=ABC123 으로 오면 코드가 채워져 있다
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <SignupForm initialCode={typeof code === "string" ? code : ""} />;
}

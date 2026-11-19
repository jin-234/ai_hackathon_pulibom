import { env } from "./env";

// 실시간 새로고침 설정 (서버 전용). db/init/15_realtime.sql 의 트리거가 보내는 신호를 선생님 화면이 받는다
//  SUPABASE_ANON_KEY: Supabase 대시보드 → Project Settings → API Keys 의 anon(public) 키. 없으면 실시간 없이 폴링
//  주소: DATABASE_URL 의 사용자 이름(postgres.<프로젝트ID>)으로 https://<프로젝트ID>.supabase.co 를 만든다.
//        거기서 못 찾을 때만 SUPABASE_URL 을 쓴다 (app/.env.local 에 남은 예전 템플릿의 'https://xxxx.supabase.co' 가 이기지 않게)
export function realtimeConfig(): { url: string; key: string } | null {
  const key = env("SUPABASE_ANON_KEY");
  if (!key) return null;
  let url: string | undefined;
  try {
    const ref = new URL(env("DATABASE_URL") ?? "").username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
    if (ref) url = `https://${ref}.supabase.co`;
  } catch {
    // 주소를 못 읽음
  }
  url ??= env("SUPABASE_URL");
  return url ? { url: url.replace(/\/+$/, ""), key } : null;
}

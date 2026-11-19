import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버 전용. service role 키는 절대 클라이언트 컴포넌트에서 import 하지 말 것.
export const BUCKET = "solutions";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function signedImageUrl(path: string | null, expiresIn = 3600) {
  if (!path) return null;
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

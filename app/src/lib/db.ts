import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

// PostgreSQL 연결 (Supabase). 모든 데이터는 DB에 저장한다.
const g = globalThis as unknown as { pulibomPool?: Pool };

export function hasDb() {
  return Boolean(env("DATABASE_URL"));
}

function pool() {
  if (!hasDb()) throw new Error("DB 설정이 없어요. 루트 .env 에 Supabase 접속 주소(DATABASE_URL)를 넣어 주세요 (.env.example 참고).");
  if (!g.pulibomPool) {
    const url = new URL(env("DATABASE_URL")!);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    // 주소의 sslmode 는 빼고 직접 지정 (pg 는 sslmode=require 를 인증서 검증까지 하는 것으로 처리해 Supabase 접속이 실패할 수 있음)
    url.searchParams.delete("sslmode");
    // 개발 서버가 코드를 다시 불러와도 연결이 쌓이지 않게 하나만 만든다
    g.pulibomPool = new Pool({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  }
  return g.pulibomPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const p = pool();
  try {
    return (await p.query<T>(sql, params)).rows;
  } catch (e) {
    const err = e as { code?: string; message: string };
    if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"].includes(err.code ?? "") || /connect|getaddrinfo/i.test(err.message))
      throw new Error("DB에 연결할 수 없어요. 인터넷 연결과 .env 의 DATABASE_URL(Supabase 접속 주소)을 확인해 주세요.");
    if (/password authentication failed/i.test(err.message))
      throw new Error("DB 비밀번호가 틀렸어요. .env 의 DATABASE_URL 에 Supabase DB 비밀번호가 맞게 들어갔는지 확인해 주세요.");
    throw e;
  }
}

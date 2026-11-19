import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE } from "./auth";

export async function getSession() {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

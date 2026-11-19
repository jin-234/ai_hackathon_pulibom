import { randomInt } from "crypto";
import type { Session } from "./auth";
import { query } from "./db";

// 반 코드로 학생 회원가입 (DB: classes.join_code, db/init/08_join_code.sql)
//  학생이 반 코드 + 번호 + 이름 + 비밀번호를 넣으면 계정을 만들고 그 반 학생(class_members active)으로 바로 넣는다 (교사 승인 없음)
//  로그인은 지금처럼 로그인 화면의 반·번호 명단에서 고르고 비밀번호 입력
//  ⚠ 중1은 대부분 만 14세 미만: 받는 개인정보는 이름·번호만 (아이디는 자동으로 만든다)

const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 헷갈리는 0·O·1·I·L 제외
export const normalizeCode = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

function newCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
}

export type JoinClass = { id: string; name: string; grade: number; schoolYear: number };

// 반 코드 → 반 (보관된 반에는 가입할 수 없음)
export async function classByCode(code: string): Promise<JoinClass | null> {
  const c = normalizeCode(code);
  if (c.length !== 6) return null;
  const rows = await query<JoinClass>(
    `SELECT id, name, grade, school_year AS "schoolYear" FROM classes WHERE join_code = $1 AND NOT archived`,
    [c],
  );
  return rows[0] ?? null;
}

export async function getJoinCode(classId: string): Promise<string | null> {
  const rows = await query<{ join_code: string | null }>(`SELECT join_code FROM classes WHERE id = $1`, [classId]);
  return rows[0]?.join_code ?? null;
}

// 새 반 코드 (코드가 밖으로 퍼졌을 때 교사가 다시 만든다. 이미 가입한 학생은 그대로)
export async function regenerateJoinCode(classId: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      await query(`UPDATE classes SET join_code = $2 WHERE id = $1`, [classId, code]);
      return code;
    } catch {
      // 다른 반과 겹치면 다시
    }
  }
  throw new Error("반 코드를 만들지 못했어요. 다시 시도해 주세요.");
}

export type SignupInput = { code: string; number: number; name: string; password: string };

export function validateSignup(v: Partial<Record<keyof SignupInput, unknown>>): SignupInput {
  const code = normalizeCode(String(v.code ?? ""));
  const number = Number(v.number);
  const name = String(v.name ?? "").trim().replace(/\s+/g, " ");
  const password = String(v.password ?? "");
  if (code.length !== 6) throw new Error("반 코드 6자리를 넣어 주세요.");
  if (!Number.isInteger(number) || number < 1 || number > 60) throw new Error("번호는 1~60 사이 숫자로 넣어 주세요.");
  if (!name || name.length > 20) throw new Error("이름을 20자 안으로 넣어 주세요.");
  if (!/^\d{4,8}$/.test(password)) throw new Error("비밀번호는 숫자 4~8자리로 정해 주세요.");
  return { code, number, name, password };
}

export async function signupStudent(input: SignupInput): Promise<{ session: Session; className: string }> {
  const cls = await classByCode(input.code);
  if (!cls) throw new Error("반 코드를 찾을 수 없어요. 선생님께 받은 코드를 다시 확인해 주세요.");
  // 그 반에 같은 번호 학생이 이미 있으면 막는다 (번호 선택으로 로그인하므로)
  const taken = await query(`SELECT 1 FROM class_members WHERE class_id = $1 AND number = $2 AND status = 'active'`, [cls.id, input.number]);
  if (taken.length) throw new Error(`${cls.name}에 ${input.number}번 학생이 이미 있어요. 번호를 확인하거나 선생님께 말씀해 주세요.`);

  const id = `u${Date.now().toString(36)}${randomInt(36 ** 3).toString(36).padStart(3, "0")}`;
  // 계정 + 반 소속을 한 문장으로 (둘 중 하나만 생기지 않게)
  //  students.class_id 는 예전 칸이라 비워 둔다 (반 정보는 class_members 기준. 비워야 예전 UNIQUE(class_id, number)와 안 겹침)
  await query(
    `WITH s AS (
       INSERT INTO students (id, class_id, number, name, password_hash)
       VALUES ($1, NULL, $3, $4, crypt($5, gen_salt('bf')))
       RETURNING id
     )
     INSERT INTO class_members (class_id, student_id, number, status)
     SELECT $2, id, $3, 'active' FROM s`,
    [id, cls.id, input.number, input.name, input.password],
  );
  return { session: { role: "student", id, name: input.name }, className: cls.name };
}

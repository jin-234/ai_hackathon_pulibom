import { DEMO_TEACHER, type Session } from "./auth";
import { query } from "./db";

// 학생 명단·로그인 (DB: students·teachers·classes·class_members)
export type RosterStudent = { id: string; number: number | null; name: string; classId: string; className: string };

// 로그인 명단: 지금 반(보관 안 된 반)에 소속된 학생. 한 학생은 지금 반 하나로만 나온다
export async function getRoster(): Promise<RosterStudent[]> {
  return query<RosterStudent>(
    `SELECT * FROM (
       SELECT DISTINCT ON (s.id) s.id, m.number, s.name, c.id AS "classId", c.name AS "className",
              c.school_year, c.grade
         FROM students s
         JOIN class_members m ON m.student_id = s.id AND m.status = 'active'
         JOIN classes c ON c.id = m.class_id AND NOT c.archived
        WHERE s.active
        ORDER BY s.id, m.joined_at DESC
     ) r
     ORDER BY r.school_year DESC, r.grade, r."className", r.number NULLS LAST`,
  );
}

// 학생 한 명 (지난 학년 학생도 찾는다)
export async function getStudent(id: string): Promise<{ id: string; name: string } | undefined> {
  if (!/^[\w-]+$/.test(id)) return undefined;
  return (await query<{ id: string; name: string }>(`SELECT id, name FROM students WHERE id = $1`, [id]))[0];
}

// 학생의 지금 학년 (가장 최근에 들어간 반 기준, 1~3 = 중1~중3, 4 = 고1). 반이 없으면 null
export async function getStudentGrade(id: string): Promise<number | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  const rows = await query<{ grade: number }>(
    `SELECT c.grade FROM class_members m JOIN classes c ON c.id = m.class_id
      WHERE m.student_id = $1 ORDER BY (m.status = 'active') DESC, m.joined_at DESC LIMIT 1`,
    [id],
  );
  return rows[0]?.grade ?? null;
}

export async function checkLogin(role: Session["role"], id: string, password: string): Promise<Session | null> {
  if (!id || !password) return null;
  // 비밀번호는 DB에서 crypt() 로 비교 (평문 저장 안 함)
  const rows =
    role === "teacher"
      ? await query<{ id: string; name: string }>(`SELECT id, name FROM teachers WHERE id = $1 AND password_hash = crypt($2, password_hash)`, [id, password])
      : await query<{ id: string; name: string }>(
          `SELECT id, name FROM students WHERE id = $1 AND active AND password_hash = crypt($2, password_hash)`,
          [id, password],
        );
  return rows[0] ? { role, id: rows[0].id, name: rows[0].name } : null;
}

// 로그인 건너뛰기: 데모 사용자 (학생은 명단의 첫 번째)
export async function demoSession(role: Session["role"]): Promise<Session> {
  if (role === "teacher") return { role, id: DEMO_TEACHER.id, name: DEMO_TEACHER.name, demo: true };
  const first = (await getRoster())[0];
  if (!first) throw new Error("학생 명단이 비어 있어요.");
  return { role, id: first.id, name: first.name, demo: true };
}

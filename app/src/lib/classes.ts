import { query } from "./db";
import type { Submission } from "./types";

// 반·반 소속·교사 열람 권한 (DB: classes, class_members, teacher_classes)
//  - 학생 계정은 그대로, 반 소속(class_members)만 학년도마다 새로 생긴다
//  - 학년이 끝난 반은 보관(archived): 학생 화면에서 사라지고, 교사에게는 읽기 전용 '지난 반'
export type ClassInfo = { id: string; name: string; grade: number; schoolYear: number; archived: boolean };

export const classLabel = (c: Pick<ClassInfo, "schoolYear" | "name">) => `${c.schoolYear}학년도 ${c.name}`;

const isId = (id: string) => /^[\w-]+$/.test(id);

// 교사가 담당하는 반 (올해 반 먼저, 지난 반은 최근 학년도부터)
export async function teacherClasses(teacherId: string): Promise<ClassInfo[]> {
  return query<ClassInfo>(
    `SELECT c.id, c.name, c.grade, c.school_year AS "schoolYear", c.archived
       FROM teacher_classes t JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = $1
      ORDER BY c.archived, c.school_year DESC, c.grade, c.name`,
    [teacherId],
  );
}

export async function teacherClass(teacherId: string, classId: string) {
  if (!isId(classId)) return undefined;
  return (await teacherClasses(teacherId)).find((c) => c.id === classId);
}

// 교사가 고른 반이 없거나 담당이 아니면 첫 번째 담당 반 (올해 반 우선)
export async function resolveTeacherClass(teacherId: string, classId: string | null) {
  const list = await teacherClasses(teacherId);
  return list.find((c) => c.id === classId) ?? list[0];
}

export async function setClassArchived(classId: string, archived: boolean) {
  await query(`UPDATE classes SET archived = $2 WHERE id = $1`, [classId, archived]);
}

// 반 명단: 올해 반은 지금 소속된 학생, 보관된 반은 그 해에 소속됐던 학생 전부
export type ClassMember = { id: string; name: string; number: number | null };

export async function classMembers(classId: string): Promise<ClassMember[]> {
  return query<ClassMember>(
    `SELECT s.id, s.name, m.number
       FROM class_members m
       JOIN classes c ON c.id = m.class_id
       JOIN students s ON s.id = m.student_id
      WHERE m.class_id = $1 AND (m.status = 'active' OR (c.archived AND m.status = 'left'))
      ORDER BY m.number NULLS LAST, s.name`,
    [classId],
  );
}

// 반에 지금 소속된 학생 id (보충 과제 대상 확인용)
export async function activeMemberIds(classId: string): Promise<string[]> {
  const rows = await query<{ student_id: string }>(`SELECT student_id FROM class_members WHERE class_id = $1 AND status = 'active'`, [classId]);
  return rows.map((r) => r.student_id);
}

// 학생이 지금 속한 반 (보관되지 않은 반의 승인된 소속)
export async function studentCurrentClassIds(studentId: string): Promise<string[]> {
  const rows = await query<{ class_id: string }>(
    `SELECT m.class_id FROM class_members m JOIN classes c ON c.id = m.class_id
      WHERE m.student_id = $1 AND m.status = 'active' AND NOT c.archived`,
    [studentId],
  );
  return rows.map((r) => r.class_id);
}

// ── 교사의 학생 기록 열람 권한 ─────────────────────────
//  current: 내 올해 반에 지금 소속된 학생 → 전 학년 기록 전부. 수정은 내 올해 반 기록만
//  past:    예전에 내 반이었던 학생 (보관된 반·떠난 학생) → 내 반 시절 기록만 읽기 전용
//  none:    볼 수 없음
export type StudentAccess = {
  level: "current" | "past" | "none";
  currentClassIds: string[]; // 학생이 지금 속한 내 올해 반
  myClassIds: string[]; // 학생이 속했던 내 반 전체 (보관 포함)
  editableClassIds: string[]; // 내가 수정할 수 있는 반 (보관 안 된 내 반)
};

export async function studentAccess(teacherId: string, studentId: string): Promise<StudentAccess> {
  const none: StudentAccess = { level: "none", currentClassIds: [], myClassIds: [], editableClassIds: [] };
  if (!isId(studentId)) return none;
  const rows = await query<{ class_id: string; archived: boolean; status: string }>(
    `SELECT m.class_id, c.archived, m.status
       FROM class_members m
       JOIN classes c ON c.id = m.class_id
       JOIN teacher_classes t ON t.class_id = m.class_id AND t.teacher_id = $1
      WHERE m.student_id = $2 AND m.status <> 'pending'`,
    [teacherId, studentId],
  );
  if (!rows.length) return none;
  const currentClassIds = rows.filter((r) => !r.archived && r.status === "active").map((r) => r.class_id);
  return {
    level: currentClassIds.length ? "current" : "past",
    currentClassIds,
    myClassIds: rows.map((r) => r.class_id),
    editableClassIds: rows.filter((r) => !r.archived).map((r) => r.class_id),
  };
}

// 이 풀이를 볼 수 있는지 / 고칠 수 있는지
//  - 반 정보가 없는 예전 풀이(기본 시연 문항)는 지금 담당 교사에게만
export function canSeeSubmission(access: StudentAccess, s: Pick<Submission, "origin">) {
  if (access.level === "current") return true;
  return !!s.origin && access.myClassIds.includes(s.origin.classId);
}

export function canEditSubmission(access: StudentAccess, s: Pick<Submission, "origin">) {
  if (access.level !== "current") return false;
  return !s.origin || access.editableClassIds.includes(s.origin.classId);
}

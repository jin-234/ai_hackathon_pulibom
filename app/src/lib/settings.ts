import { DEFAULT_SETTINGS, withDefaults, type ClassSettings } from "./classSettings";
import { studentCurrentClassIds } from "./classes";
import { query } from "./db";

// 교사 설정 DB (class_settings, db/init/09_class_settings.sql). 테이블이 아직 없으면 기본값으로 동작
export async function getClassSettings(classId: string): Promise<ClassSettings> {
  try {
    const rows = await query<{ data: unknown }>(`SELECT data FROM class_settings WHERE class_id = $1`, [classId]);
    return withDefaults(rows[0]?.data);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveClassSettings(classId: string, s: ClassSettings) {
  await query(
    `INSERT INTO class_settings (class_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (class_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [classId, JSON.stringify(s)],
  );
}

// 학생 기준 설정: 지금 속한 반의 설정 (반이 없으면 기본값)
export async function studentSettings(studentId: string): Promise<ClassSettings> {
  const [classId] = await studentCurrentClassIds(studentId).catch(() => [] as string[]);
  return classId ? getClassSettings(classId) : DEFAULT_SETTINGS;
}

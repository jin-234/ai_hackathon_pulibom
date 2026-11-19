import { NextResponse } from "next/server";
import { activeMemberIds, teacherClass } from "@/lib/classes";
import { requireTeacher } from "@/lib/guard";
import { ERROR_LABEL, type ErrorType } from "@/lib/types";

// 소그룹 보충 공통 확인: 내 올해 반 + 학생이 모두 지금 그 반 소속
export async function requireGroup(classId: string, studentIds: unknown) {
  const t = await requireTeacher();
  if ("error" in t) return t;
  const cls = await teacherClass(t.session.id, classId);
  if (!cls) return { error: NextResponse.json({ error: "담당 반이 아니에요." }, { status: 403 }) };
  if (cls.archived) return { error: NextResponse.json({ error: "보관된 반에는 보충 과제를 낼 수 없어요." }, { status: 403 }) };
  const ids = Array.isArray(studentIds) ? [...new Set(studentIds.filter((x): x is string => typeof x === "string"))] : [];
  if (!ids.length) return { error: NextResponse.json({ error: "학생을 한 명 이상 골라 주세요." }, { status: 400 }) };
  const members = new Set(await activeMemberIds(classId));
  if (ids.some((id) => !members.has(id))) return { error: NextResponse.json({ error: "이 반 학생이 아닌 학생이 있어요." }, { status: 403 }) };
  return { session: t.session, cls, studentIds: ids };
}

export const asErrorType = (v: unknown): ErrorType | null => (typeof v === "string" && v in ERROR_LABEL ? (v as ErrorType) : null);

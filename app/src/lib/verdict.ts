import type { ErrorType } from "./types";

// 학생에게 보여 줄 최종 채점 결과 (학생 과제 목록·결과 화면 공용)
//  선생님이 확인하며 오류 유형을 정했으면 그것(오류 없음 → 맞음), 아니면 AI 판정. 판정이 없으면 보류
export type Verdict = "ok" | "wrong" | "hold" | "none";
export function verdictOf(r: { teacherErrorType?: ErrorType | null; aiCorrect?: boolean | null } | undefined): Verdict {
  if (!r) return "none";
  const t = r.teacherErrorType;
  if (t && t !== "UNREADABLE") return t === "NONE" ? "ok" : "wrong";
  if (r.aiCorrect === true) return "ok";
  if (r.aiCorrect === false) return "wrong";
  return "hold";
}

// 풀이 하나의 최종 정오 (학생 화면·대시보드·학습 프로필이 같은 기준을 쓰게).
//  선생님이 확인하며 오류 유형을 정했으면 그것, 아니면 AI 판정. 판정이 없으면 null
export function correctOf(s: {
  teacher?: { errorType?: ErrorType; confirmedAt?: number } | null;
  analysis?: { correct: boolean | null } | null;
}): boolean | null {
  const v = verdictOf({ teacherErrorType: s.teacher?.confirmedAt ? s.teacher.errorType : null, aiCorrect: s.analysis?.correct });
  return v === "ok" ? true : v === "wrong" ? false : null;
}

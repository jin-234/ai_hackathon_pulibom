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

// 교사 설정 (반마다). 화면·서버 둘 다 쓴다. DB 를 import 하지 않는다 (DB 는 settings.ts)
//  - mastery: 반복 학습 기준. 극복한 오류·익힌 틀로 보려면 몇 번 연속 맞혀야 하는지
export type ClassSettings = { mastery: number };

export const MASTERY_MIN = 2;
export const MASTERY_MAX = 8;

export const DEFAULT_SETTINGS: ClassSettings = { mastery: 4 };

// 저장된 값(일부만 있을 수 있음) + 기본값
export function withDefaults(data: unknown): ClassSettings {
  const d = (data && typeof data === "object" ? data : {}) as Partial<ClassSettings>;
  const mastery = Number.isInteger(d.mastery) && d.mastery! >= MASTERY_MIN && d.mastery! <= MASTERY_MAX ? d.mastery! : DEFAULT_SETTINGS.mastery;
  return { mastery };
}

// 교사가 보낸 설정 확인
export function validateSettings(input: unknown): ClassSettings {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const mastery = Number(v.mastery);
  if (!Number.isInteger(mastery) || mastery < MASTERY_MIN || mastery > MASTERY_MAX)
    throw new Error(`반복 학습 기준은 ${MASTERY_MIN}~${MASTERY_MAX}번 사이로 정해 주세요.`);
  return { mastery };
}

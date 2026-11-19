// 개념 = 오류 유형과 1:1 대응 (오류가 나면 그 개념을 보충)
export const CONCEPTS = {
  integer_ops: { label: "정수·유리수 계산", error: "부호·계산 오류", desc: "음수의 덧셈·곱셈·나눗셈, 부호 처리" },
  like_terms: { label: "동류항 정리", error: "동류항 정리 오류", desc: "x항끼리·상수항끼리 모으기, 계수 계산, x의 값 구하기 마무리" },
  transposition: { label: "등식의 성질·이항", error: "등식 변형(이항) 오류", desc: "항을 반대편으로 옮길 때 부호 바꾸기, 양변에 같은 수 더하기·나누기" },
  distribution: { label: "분배법칙(괄호 풀기)", error: "괄호 전개 오류", desc: "괄호 앞 수·음수 부호를 괄호 안 모든 항에 곱하기" },
  fraction_coef: { label: "분수·소수 계수", error: "분수·소수 계수 처리 오류", desc: "분모의 최소공배수·10의 거듭제곱을 양변의 모든 항에 곱하기" },
} as const;

export type ConceptKey = keyof typeof CONCEPTS;
export const CONCEPT_KEYS = Object.keys(CONCEPTS) as ConceptKey[];

export const ERROR_TYPES = [...CONCEPT_KEYS, "other", "none"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export function isConcept(k: string | null | undefined): k is ConceptKey {
  return !!k && k in CONCEPTS;
}

export function conceptLabel(k: string | null | undefined) {
  return isConcept(k) ? CONCEPTS[k].label : "-";
}

export function errorLabel(k: string | null | undefined) {
  if (isConcept(k)) return CONCEPTS[k].error;
  if (k === "other") return "기타 오류";
  if (k === "none") return "오류 없음";
  return "-";
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "분석 대기",
  processing: "분석 중",
  done: "분석 완료",
  needs_review: "확인 필요",
  error: "분석 실패",
};

export const OCR_ENGINE_LABEL: Record<string, string> = {
  upstage: "Upstage OCR",
  mathpix: "Mathpix OCR",
  claude: "Claude",
  demo: "가상 데이터",
};

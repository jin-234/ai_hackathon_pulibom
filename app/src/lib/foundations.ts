import type { ErrorType } from "./types";

// 고등학생이 다시 봐야 할 중학 기초 테마 10개 (EBS '50일 수학' 상·하 목차, 2022 개정. 중학 수학을 놓친 고등학생용 보충 교재)
// 고1 학생이 틀린 풀이를 이 테마로 묶어 "고등 문제를 틀린 원인이 어느 중학 기초에 있는지"를 학습 요약에 보여 준다.
// covers: 그 테마가 다루는 중학 단원 (curriculum.ts 의 중1~중3 단원 이름 기준). 화면·서버 둘 다 쓴다. DB 를 import 하지 않는다
export type FoundationTheme = { no: number; name: string; covers: string };

export const FOUNDATION_SOURCE = "EBS 50일 수학 목차";

export const FOUNDATION_THEMES: FoundationTheme[] = [
  { no: 1, name: "수와 연산", covers: "정수와 유리수의 계산, 분수·소수, 순환소수, 제곱근과 실수" },
  { no: 2, name: "문자와 식", covers: "문자의 사용과 식의 값, 일차식·다항식의 계산, 지수법칙" },
  { no: 3, name: "곱셈 공식과 인수분해", covers: "다항식의 곱셈, 곱셈 공식, 인수분해 공식" },
  { no: 4, name: "방정식", covers: "등식의 성질과 이항, 일차방정식, 연립일차방정식, 이차방정식" },
  { no: 5, name: "부등식", covers: "부등식의 성질, 일차부등식의 풀이와 활용" },
  { no: 6, name: "함수", covers: "좌표평면과 그래프, 정비례·반비례, 일차함수, 이차함수의 그래프" },
  { no: 7, name: "여러 가지 도형", covers: "기본 도형, 평면도형(다각형·원과 부채꼴), 입체도형의 겉넓이와 부피" },
  { no: 8, name: "도형의 성질", covers: "삼각형·사각형의 성질, 도형의 닮음, 피타고라스 정리" },
  { no: 9, name: "삼각비와 원의 성질", covers: "삼각비의 뜻과 활용, 원과 직선, 원주각" },
  { no: 10, name: "도형의 방정식", covers: "좌표평면 위의 점·거리, 일차함수의 그래프로 본 직선 (고1 도형의 방정식의 기초)" },
];

export const themeLabel = (t: FoundationTheme) => `THEME ${String(t.no).padStart(2, "0")} ${t.name}`;
const theme = (no: number) => FOUNDATION_THEMES[no - 1];

// 공부 습관 실수 (조건·구하는 값·옮겨 적기)와 판정이 아닌 것은 중학 기초 테마로 묶지 않는다
const NOT_FOUNDATION: ErrorType[] = ["CONDITION", "TARGET", "COPY", "UNREADABLE", "NONE"];

// 틀린 단계(오류 유형)가 곧 비어 있는 중학 기초다: 고1 인수분해 문항이라도 부호 계산을 틀렸으면 '수와 연산'
const BY_ERROR: Partial<Record<ErrorType, number>> = {
  SIGN: 1,
  ARITH: 1,
  FRACTION: 1,
  PAREN_SIGN: 2,
  DISTRIBUTE: 2,
  LIKE_TERMS: 2,
  SUBSTITUTE: 2,
  EXPR_MEANING: 2,
  TRANSPOSE: 4,
  DIVIDE: 4,
  FACTOR: 3,
};

// 오류 유형으로 정해지지 않으면(공식·개념 적용 등) 문항의 개념·문제 글로. 앞에 있는 것부터 본다
// ('원의 방정식'은 방정식이 아니라 도형의 방정식, '이차부등식'은 방정식이 아니라 부등식)
const BY_CONCEPT: [RegExp, number][] = [
  [/좌표|두\s*점\s*사이|직선의\s*방정식|원의\s*방정식|대칭이동|평행이동|내분점|무게중심/, 10],
  [/인수분해|곱셈\s*공식|전개|완전제곱|나머지정리|인수정리|조립제법/, 3],
  [/부등식|[<>≤≥]/, 5],
  [/삼각비|sin|cos|tan|원주각|접선/, 9],
  [/방정식|근의\s*공식|판별식|근과\s*계수/, 4],
  [/함수|그래프|기울기|절편|꼭짓점|정비례|반비례/, 6],
  [/합동|닮음|피타고라스|외심|내심|이등변|평행사변형/, 8],
  [/넓이|부피|다각형|내각|외각|부채꼴|입체|다면체/, 7],
  [/다항식|동류항|식의\s*값|지수법칙|일차식/, 2],
  [/정수|유리수|분수|소수|제곱근|√|복소수|절댓값|소인수/, 1],
];

// 틀린 풀이 하나 → 다시 봐야 할 중학 기초 테마 (없으면 null)
//  stepConcept: 채점 때 AI 가 남긴 '틀린 단계의 개념' (예: '인수분해'). 있고 테마가 분명하면 그것을 먼저 쓴다
export function foundationOf(errorType: ErrorType | undefined, conceptText: string, stepConcept?: string): FoundationTheme | null {
  if (!errorType || NOT_FOUNDATION.includes(errorType)) return null;
  const byStep = stepConcept ? BY_CONCEPT.find(([re]) => re.test(stepConcept)) : undefined;
  if (byStep) return theme(byStep[1]);
  const byError = BY_ERROR[errorType];
  if (byError) {
    // 부등식 문항에서 이항·양변 나누기를 틀렸으면 (음수로 나눌 때 부등호 방향 등) 방정식이 아니라 부등식
    if (byError === 4 && /부등식|[<>≤≥]/.test(conceptText)) return theme(5);
    return theme(byError);
  }
  const hit = BY_CONCEPT.find(([re]) => re.test(conceptText));
  return hit ? theme(hit[1]) : null;
}

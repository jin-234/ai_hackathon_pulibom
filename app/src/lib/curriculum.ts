// 교육과정 단원 목록 (2022 개정 중학교 수학, 학년별 교과서 단원 기준 초안 · 수학교사 검토 필요)
//  과제 출제 화면에서 반의 학년에 맞는 단원만 보여 준다 → 소단원을 고르면 과제 이름이 채워지고 문항을 만든다
//  - templates: 그 소단원 문항을 만들 수 있는 문제은행 틀 (problem_templates.id). 정답은 풀이기로 자동 검증
//  - 틀이 없는 소단원은 교사가 원하면 AI 가 desc(학습 내용)에 맞춰 문항 초안을 만든다 → 교사가 확인 후 출제
// 화면·서버 둘 다 쓴다. DB 를 import 하지 않는다

export type Lesson = { id: string; name: string; desc: string; templates?: string[] };
export type Unit = { id: string; no: string; name: string; area: string; lessons: Lesson[] };

const EQ_PROP = ["t-ax-b-c", "t-ax-minus-b-c", "t-ax-c", "t-b-minus-ax-c", "t-ax-b-c-neg"];
const EQ_SOLVE = ["t-like-same", "t-both-sides", "t-both-sides-neg", "t-paren-c", "t-paren-both", "t-neg-paren"];

export const CURRICULUM: Record<number, Unit[]> = {
  1: [
    { id: "1-1", no: "Ⅰ", name: "소인수분해", area: "수와 연산", lessons: [
      { id: "1-1-1", name: "소수와 합성수", desc: "소수와 합성수의 뜻, 거듭제곱" },
      { id: "1-1-2", name: "소인수분해", desc: "자연수를 소인수의 곱으로 나타내기, 약수 구하기" },
      { id: "1-1-3", name: "최대공약수와 최소공배수", desc: "소인수분해를 이용해 최대공약수·최소공배수 구하기와 활용" },
    ] },
    { id: "1-2", no: "Ⅱ", name: "정수와 유리수", area: "수와 연산", lessons: [
      { id: "1-2-1", name: "정수와 유리수의 뜻", desc: "양수와 음수, 정수와 유리수, 수직선, 절댓값, 수의 대소 관계" },
      { id: "1-2-2", name: "정수와 유리수의 덧셈·뺄셈", desc: "부호가 다른 수의 덧셈과 뺄셈, 덧셈의 계산 법칙" },
      { id: "1-2-3", name: "정수와 유리수의 곱셈·나눗셈", desc: "곱셈·나눗셈의 부호, 역수, 혼합 계산" },
    ] },
    { id: "1-3", no: "Ⅲ", name: "문자와 식", area: "변화와 관계", lessons: [
      { id: "1-3-1", name: "문자의 사용과 식의 값", desc: "문자를 사용한 식 세우기, 곱셈·나눗셈 기호 생략, 식의 값 구하기" },
      { id: "1-3-2", name: "일차식의 계산", desc: "다항식·일차식의 뜻, 동류항 정리, 분배법칙을 이용한 일차식의 덧셈·뺄셈" },
      { id: "1-3-3", name: "등식의 성질과 이항", desc: "방정식과 항등식, 등식의 성질, 이항", templates: EQ_PROP },
      { id: "1-3-4", name: "일차방정식의 풀이", desc: "동류항 정리·괄호가 있는 일차방정식, 양변에 x 가 있는 일차방정식 풀기", templates: EQ_SOLVE },
      { id: "1-3-5", name: "일차방정식의 활용", desc: "문장을 일차방정식으로 세워 풀기 (수, 나이, 거리·속력·시간, 개수 등)" },
    ] },
    { id: "1-4", no: "Ⅳ", name: "좌표평면과 그래프", area: "변화와 관계", lessons: [
      { id: "1-4-1", name: "순서쌍과 좌표", desc: "수직선과 좌표평면 위의 점, 사분면" },
      { id: "1-4-2", name: "그래프의 해석", desc: "상황을 나타낸 그래프를 읽고 해석하기" },
      { id: "1-4-3", name: "정비례와 반비례", desc: "y = ax, y = a/x 관계와 그래프, 활용" },
    ] },
    { id: "1-5", no: "Ⅴ", name: "기본 도형", area: "도형과 측정", lessons: [
      { id: "1-5-1", name: "점·선·면·각", desc: "직선·반직선·선분, 각의 크기, 맞꼭지각, 수직과 수선" },
      { id: "1-5-2", name: "위치 관계", desc: "점·직선·평면의 위치 관계, 동위각과 엇각, 평행선의 성질" },
      { id: "1-5-3", name: "작도와 합동", desc: "삼각형의 작도, 삼각형의 합동 조건" },
    ] },
    { id: "1-6", no: "Ⅵ", name: "평면도형의 성질", area: "도형과 측정", lessons: [
      { id: "1-6-1", name: "다각형", desc: "다각형의 내각과 외각, 내각의 합, 대각선의 개수" },
      { id: "1-6-2", name: "원과 부채꼴", desc: "중심각과 호·현, 부채꼴의 호의 길이와 넓이 (π 사용)" },
    ] },
    { id: "1-7", no: "Ⅶ", name: "입체도형의 성질", area: "도형과 측정", lessons: [
      { id: "1-7-1", name: "다면체와 회전체", desc: "다면체의 꼭짓점·모서리·면의 개수, 정다면체, 회전체" },
      { id: "1-7-2", name: "입체도형의 겉넓이와 부피", desc: "기둥·뿔·구의 겉넓이와 부피" },
    ] },
    { id: "1-8", no: "Ⅷ", name: "자료의 정리와 해석", area: "자료와 가능성", lessons: [
      { id: "1-8-1", name: "대푯값", desc: "평균·중앙값·최빈값 구하기와 비교" },
      { id: "1-8-2", name: "도수분포표와 그래프", desc: "줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형 (자료는 글·표로 제시)" },
      { id: "1-8-3", name: "상대도수", desc: "상대도수와 그 분포를 이용한 자료 비교" },
    ] },
  ],
  2: [
    { id: "2-1", no: "Ⅰ", name: "유리수와 순환소수", area: "수와 연산", lessons: [
      { id: "2-1-1", name: "유리수와 순환소수", desc: "유한소수와 순환소수, 순환소수를 분수로 나타내기" },
    ] },
    { id: "2-2", no: "Ⅱ", name: "식의 계산", area: "변화와 관계", lessons: [
      { id: "2-2-1", name: "지수법칙", desc: "지수법칙을 이용한 단항식의 곱셈·나눗셈" },
      { id: "2-2-2", name: "다항식의 계산", desc: "다항식의 덧셈·뺄셈, 단항식과 다항식의 곱셈·나눗셈" },
    ] },
    { id: "2-3", no: "Ⅲ", name: "일차부등식", area: "변화와 관계", lessons: [
      { id: "2-3-1", name: "부등식의 성질", desc: "부등식의 뜻과 해, 부등식의 성질" },
      { id: "2-3-2", name: "일차부등식의 풀이", desc: "일차부등식 풀기와 해를 수직선에 나타내기" },
      { id: "2-3-3", name: "일차부등식의 활용", desc: "문장을 일차부등식으로 세워 풀기" },
    ] },
    { id: "2-4", no: "Ⅳ", name: "연립일차방정식", area: "변화와 관계", lessons: [
      { id: "2-4-1", name: "연립일차방정식의 풀이", desc: "가감법과 대입법으로 연립일차방정식 풀기" },
      { id: "2-4-2", name: "연립일차방정식의 활용", desc: "문장을 연립일차방정식으로 세워 풀기" },
    ] },
    { id: "2-5", no: "Ⅴ", name: "일차함수", area: "변화와 관계", lessons: [
      { id: "2-5-1", name: "일차함수와 그래프", desc: "함수의 뜻, 일차함수의 그래프, 기울기와 절편" },
      { id: "2-5-2", name: "일차함수의 식 구하기", desc: "기울기·지나는 점이 주어질 때 일차함수의 식 구하기, 활용" },
      { id: "2-5-3", name: "일차함수와 일차방정식", desc: "일차방정식의 그래프, 연립방정식의 해와 그래프의 교점" },
    ] },
    { id: "2-6", no: "Ⅵ", name: "도형의 성질", area: "도형과 측정", lessons: [
      { id: "2-6-1", name: "삼각형의 성질", desc: "이등변삼각형의 성질, 삼각형의 외심과 내심" },
      { id: "2-6-2", name: "사각형의 성질", desc: "평행사변형의 성질과 조건, 여러 가지 사각형" },
    ] },
    { id: "2-7", no: "Ⅶ", name: "도형의 닮음과 피타고라스 정리", area: "도형과 측정", lessons: [
      { id: "2-7-1", name: "도형의 닮음", desc: "닮음비, 삼각형의 닮음 조건, 평행선과 선분의 길이의 비" },
      { id: "2-7-2", name: "피타고라스 정리", desc: "피타고라스 정리와 활용" },
    ] },
    { id: "2-8", no: "Ⅷ", name: "확률", area: "자료와 가능성", lessons: [
      { id: "2-8-1", name: "경우의 수", desc: "사건과 경우의 수, 합의 법칙과 곱의 법칙" },
      { id: "2-8-2", name: "확률의 뜻과 계산", desc: "확률의 뜻과 성질, 확률의 계산" },
    ] },
  ],
  3: [
    { id: "3-1", no: "Ⅰ", name: "실수와 그 계산", area: "수와 연산", lessons: [
      { id: "3-1-1", name: "제곱근과 실수", desc: "제곱근의 뜻과 성질, 무리수와 실수, 대소 관계" },
      { id: "3-1-2", name: "근호를 포함한 식의 계산", desc: "제곱근의 곱셈·나눗셈, 분모의 유리화, 덧셈·뺄셈" },
    ] },
    { id: "3-2", no: "Ⅱ", name: "다항식의 곱셈과 인수분해", area: "변화와 관계", lessons: [
      { id: "3-2-1", name: "곱셈 공식", desc: "다항식의 곱셈, 곱셈 공식" },
      { id: "3-2-2", name: "인수분해", desc: "인수분해 공식을 이용한 인수분해" },
    ] },
    { id: "3-3", no: "Ⅲ", name: "이차방정식", area: "변화와 관계", lessons: [
      { id: "3-3-1", name: "이차방정식의 풀이", desc: "인수분해·제곱근·완전제곱식·근의 공식을 이용한 풀이" },
      { id: "3-3-2", name: "이차방정식의 활용", desc: "문장을 이차방정식으로 세워 풀기" },
    ] },
    { id: "3-4", no: "Ⅳ", name: "이차함수", area: "변화와 관계", lessons: [
      { id: "3-4-1", name: "이차함수와 그래프", desc: "y = ax², y = a(x-p)² + q 의 그래프, 꼭짓점과 축" },
      { id: "3-4-2", name: "이차함수 y = ax² + bx + c", desc: "표준형으로 바꾸기, 그래프의 성질" },
    ] },
    { id: "3-5", no: "Ⅴ", name: "삼각비", area: "도형과 측정", lessons: [
      { id: "3-5-1", name: "삼각비의 뜻과 값", desc: "sin·cos·tan 의 뜻, 특수각의 삼각비" },
      { id: "3-5-2", name: "삼각비의 활용", desc: "삼각비를 이용한 길이·넓이 구하기" },
    ] },
    { id: "3-6", no: "Ⅵ", name: "원의 성질", area: "도형과 측정", lessons: [
      { id: "3-6-1", name: "원과 직선", desc: "현의 수직이등분선, 원의 접선의 성질" },
      { id: "3-6-2", name: "원주각", desc: "원주각과 중심각, 원주각의 성질" },
    ] },
    { id: "3-7", no: "Ⅶ", name: "통계", area: "자료와 가능성", lessons: [
      { id: "3-7-1", name: "산포도", desc: "편차, 분산과 표준편차" },
      { id: "3-7-2", name: "상자그림과 산점도", desc: "상자그림, 산점도와 상관관계" },
    ] },
  ],
};

export const unitsOf = (grade: number) => CURRICULUM[grade] ?? [];

export function findLesson(grade: number, lessonId: string) {
  for (const unit of unitsOf(grade)) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, lesson };
  }
  return null;
}

// 과제 이름: '중1 · 문자와 식 · 일차방정식의 풀이'
export const lessonTitle = (grade: number, unit: Unit, lesson: Lesson) => `중${grade} · ${unit.name} · ${lesson.name}`;

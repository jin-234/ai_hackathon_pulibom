// 약점 파악 프롬프트 테스트: 약점을 미리 정해 둔 더미 학생들의 풀이를
//   ① 실제 AI 로 문항마다 채점(analyzeSolution) → ② 학생별 약점 요약(summarize) 하고, 예상과 맞는지 본다.
//   DB 에는 아무것도 쓰지 않는다 (Upstage API 만 호출: 채점 약 90번 + 요약 20번).
//
//   npm run test:weakness                 모든 학생
//   npm run test:weakness -- 부호          이름에 '부호'가 들어간 학생만
//   npm run test:weakness -- 설문          교사 설문 실수 유형 8개(+ 섞인 경우 2명)만
//   npm run test:weakness -- --json       요약 전체(JSON)도 출력
//   npm run test:weakness -- --twice      같은 기록으로 요약을 두 번 만들어 같은지
import { analyzeSolution } from "../src/lib/ai";
import { solveLinear } from "../src/lib/equation";
import { summarize } from "../src/lib/summary";
import { ERROR_LABEL, type ErrorType, type Problem, type Submission } from "../src/lib/types";

// ── 문항 (정답은 풀이기로 계산) ──
const QUESTIONS = [
  "2x + 3 = 11", "3x - 5 = -8", "4x - 9 = -1", "5x - 5 = x - 1", "6x = 18", "-2x + 7 = 13", "2(x - 3) = 4", "7 - 3x = 1",
  // 교사 설문 실수 유형용
  "3x + 2x - 4 = 11", "2(x + 3) = 14", "3(x - 2) = 9", "-(x + 3) = 5", "7 - (x - 2) = 4", "5 - (2x + 1) = 10", "3x + 4 = 19", "4x - 9 = 15",
];
const problems = new Map<string, Problem>(
  QUESTIONS.map((q, i) => {
    const s = solveLinear(q);
    return [`p${i + 1}`, { id: `p${i + 1}`, title: `${i + 1}번 문항`, question: q, answer: s.answer, concept: s.concept, solution: s.steps }];
  }),
);
// 문장제 (풀이기로 못 푸니 정답을 직접)
const WORD: [string, string][] = [
  ["어떤 수 x 의 3배에서 4를 빼면 11 이에요. x 를 구하세요.", "x=5"],
  ["어떤 수 x 에 5를 더한 것의 2배는 18 이에요. x 를 구하세요.", "x=4"],
  ["한 개에 300원인 사탕 x 개와 500원짜리 초콜릿 1개를 사고 2600원을 냈어요. x 를 구하세요.", "x=7"],
];
WORD.forEach(([q, a], i) => problems.set(`w${i + 1}`, { id: `w${i + 1}`, title: `문장제 ${i + 1}`, question: q, answer: a, concept: "일차방정식의 활용", solution: [] }));
// 교사 설문 실수 유형용 문항: 조건이 붙은 문항, x 가 아닌 값을 묻는 문장제, 음수 계산, 식의 값 (정답·해설을 직접)
const FREE: Record<string, { q: string; a: string; concept: string; solution: string[] }> = {
  // 조건
  absPos: { q: "절댓값이 3인 수 중에서 양수를 구하세요.", a: "3", concept: "절댓값", solution: ["절댓값이 3인 수는 3, -3", "그중 양수는 3"] },
  absNeg: { q: "x 는 음수이고 x 의 절댓값은 5 예요. x 를 구하세요.", a: "x=-5", concept: "절댓값", solution: ["절댓값이 5인 수는 5, -5", "x 는 음수이므로 x = -5"] },
  natural: { q: "-2 보다 크고 3 보다 작은 정수 중에서 자연수를 모두 구하세요.", a: "1, 2", concept: "정수와 자연수", solution: ["-2 보다 크고 3 보다 작은 정수는 -1, 0, 1, 2", "그중 자연수는 1, 2"] },
  // 구하는 값
  pear: { q: "사과가 x 개 있고, 배는 사과보다 3개 많아요. 사과와 배가 모두 13개일 때, 배는 몇 개인지 구하세요.", a: "8개", concept: "일차방정식의 활용", solution: ["x + (x + 3) = 13", "2x = 10", "x = 5", "배는 x + 3 = 8 (개)"] },
  brother: { q: "형의 나이는 동생 나이의 2배예요. 동생의 나이를 x 살이라 하면 두 사람 나이의 합은 36살이에요. 형의 나이를 구하세요.", a: "24살", concept: "일차방정식의 활용", solution: ["x + 2x = 36", "3x = 36", "x = 12", "형은 2x = 24 (살)"] },
  width: { q: "가로가 세로보다 4 cm 긴 직사각형의 둘레가 32 cm 예요. 세로를 x cm 라 할 때, 가로의 길이를 구하세요.", a: "10 cm", concept: "일차방정식의 활용", solution: ["2(x + x + 4) = 32", "4x + 8 = 32", "x = 6", "가로는 x + 4 = 10 (cm)"] },
  // 음수 계산
  negMul: { q: "계산하세요: (-2) × (-3) + 4", a: "10", concept: "정수의 곱셈·덧셈", solution: ["(-2) × (-3) = 6", "6 + 4 = 10"] },
  // 대입 (식의 값)
  subSq: { q: "x = -2 일 때, x² + 3 의 값을 구하세요.", a: "7", concept: "식의 값", solution: ["(-2)² + 3", "4 + 3 = 7"] },
  subSq2: { q: "x = -3 일 때, 2x² 의 값을 구하세요.", a: "18", concept: "식의 값", solution: ["2 × (-3)²", "2 × 9 = 18"] },
  subMinus: { q: "x = -2 일 때, 5 - x 의 값을 구하세요.", a: "7", concept: "식의 값", solution: ["5 - (-2)", "5 + 2 = 7"] },
  subPos: { q: "x = 3 일 때, 2x + 1 의 값을 구하세요.", a: "7", concept: "식의 값", solution: ["2 × 3 + 1", "6 + 1 = 7"] },
};
for (const [k, f] of Object.entries(FREE)) problems.set(`f-${k}`, { id: `f-${k}`, title: f.concept, question: f.q, free: true, answer: f.a, concept: f.concept, solution: f.solution });
const pid = (q: string) => [...problems.values()].find((p) => p.question === q)!.id;

// ── 더미 학생: 풀이(인식된 줄)와 이 줄에 대해 기대하는 오류 유형 ──
type Attempt = { q: string; lines: string[]; expect: ErrorType; teacher?: { errorType?: ErrorType; memo?: string } };
type Dummy = {
  name: string;
  expectWeak: string[]; // 첫 약점·첫 문장에 이 중 하나
  expectWeakAll?: string[][]; // 약점이 여럿: 묶음마다 하나씩 weakConcepts 에 '높음'으로
  expectNoWeak?: boolean;
  expectImproved?: boolean;
  attempts: Attempt[];
};
const SIGN_KW = ["부호", "음수", "뺄셈", "정수"];
const TRANSPOSE_KW = ["이항", "등식"];
const DISTRIBUTE_KW = ["일부 항", "분배", "곱"];
const PAREN_SIGN_KW = ["괄호 앞"];
const OK_2X3: Attempt = { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" };
const OK_6X: Attempt = { q: "6x = 18", lines: ["6x=18", "x=3"], expect: "NONE" };

const STUDENTS: Dummy[] = [
  {
    name: "부호 약한 학생",
    expectWeak: ["부호", "음수", "뺄셈", "정수"],
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-13", "x=-13/3"], expect: "SIGN" },
      { q: "-2x + 7 = 13", lines: ["-2x+7=13", "-2x=13-7", "-2x=6", "x=3"], expect: "DIVIDE" },
      { q: "7 - 3x = 1", lines: ["7-3x=1", "-3x=1-7", "-3x=-8", "x=8/3"], expect: "SIGN" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1+9", "4x=-10", "x=-5/2"], expect: "SIGN" },
      { q: "6x = 18", lines: ["6x=18", "x=3"], expect: "NONE" },
    ],
  },
  {
    name: "이항 약한 학생",
    expectWeak: ["이항", "등식"],
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11+3", "2x=14", "x=7"], expect: "TRANSPOSE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8-5", "3x=-13", "x=-13/3"], expect: "TRANSPOSE" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1-9", "4x=-10", "x=-5/2"], expect: "TRANSPOSE" },
      { q: "6x = 18", lines: ["6x=18", "x=3"], expect: "NONE" },
      { q: "5x - 5 = x - 1", lines: ["5x-5=x-1", "5x+x=-1+5", "6x=4", "x=2/3"], expect: "TRANSPOSE" },
    ],
  },
  {
    name: "잘하는 학생",
    expectWeak: [],
    expectNoWeak: true,
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-3", "x=-1"], expect: "NONE" },
      { q: "5x - 5 = x - 1", lines: ["5x-5=x-1", "5x-x=-1+5", "4x=4", "x=1"], expect: "NONE" },
      { q: "2(x - 3) = 4", lines: ["2(x-3)=4", "2x-6=4", "2x=10", "x=5"], expect: "NONE" },
      { q: "-2x + 7 = 13", lines: ["-2x+7=13", "-2x=6", "x=-3"], expect: "NONE" },
    ],
  },
  {
    // 실수가 한 번씩만 있음 + 판독 어려운 풀이: 약점을 단정하지 않고 원본 확인을 권해야 한다
    name: "실수 한 번씩·판독 어려운 학생",
    expectWeak: [],
    expectNoWeak: true,
    attempts: [
      { q: "5x - 5 = x - 1", lines: ["5x-5=x-1", "5x-x=-1+5", "6x=4", "x=2/3"], expect: "LIKE_TERMS" },
      { q: "6x = 18", lines: ["6x=18", "x=18-6", "x=12"], expect: "DIVIDE" },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "4x - 9 = -1", lines: ["4つし-9=-1", "4?=?+9", "?"], expect: "UNREADABLE" },
    ],
  },
  {
    // 처음엔 이항 실수, 다시 풀어서 맞힘 + 교사 메모: 나아진 점을 짚어야 한다
    name: "다시 풀어 나아진 학생",
    expectWeak: ["이항", "등식"],
    expectImproved: true,
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11+3", "2x=14", "x=7"], expect: "TRANSPOSE" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1-9", "4x=-10", "x=-5/2"], expect: "TRANSPOSE", teacher: { memo: "이항할 때 부호 바꾸는 걸 자꾸 잊는다고 말함" } },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1+9", "4x=8", "x=2"], expect: "NONE" },
      { q: "7 - 3x = 1", lines: ["7-3x=1", "-3x=1-7", "-3x=-6", "x=2"], expect: "NONE" },
    ],
  },
  {
    name: "동류항 정리 약한 학생",
    expectWeak: ["동류항", "정리"],
    attempts: [
      { q: "5x - 5 = x - 1", lines: ["5x-5=x-1", "5x-x=-1+5", "6x=4", "x=2/3"], expect: "LIKE_TERMS" },
      { q: "3x + 2x - 4 = 11", lines: ["3x+2x-4=11", "6x-4=11", "6x=11+4", "6x=15", "x=5/2"], expect: "LIKE_TERMS" },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-3", "x=-1"], expect: "NONE" },
    ],
  },
  {
    name: "계수 나누기 약한 학생",
    expectWeak: ["계수", "나누"],
    attempts: [
      { q: "6x = 18", lines: ["6x=18", "x=18-6", "x=12"], expect: "DIVIDE" },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=8-2", "x=6"], expect: "DIVIDE" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1+9", "4x=8", "x=32"], expect: "DIVIDE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-3", "x=-1"], expect: "NONE" },
    ],
  },
  {
    name: "부호·이항 둘 다 약한 학생",
    expectWeak: [...SIGN_KW, ...TRANSPOSE_KW],
    expectWeakAll: [SIGN_KW, TRANSPOSE_KW],
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11+3", "2x=14", "x=7"], expect: "TRANSPOSE" },
      { q: "4x - 9 = -1", lines: ["4x-9=-1", "4x=-1-9", "4x=-10", "x=-5/2"], expect: "TRANSPOSE" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-13", "x=-13/3"], expect: "SIGN" },
      { q: "7 - 3x = 1", lines: ["7-3x=1", "-3x=1-7", "-3x=-8", "x=8/3"], expect: "SIGN" },
      { q: "6x = 18", lines: ["6x=18", "x=3"], expect: "NONE" },
    ],
  },
  {
    // AI 는 부호 계산 실수로 보지만 교사가 학생과 이야기해 보고 이항 문제로 고침: 교사 판단을 따라야 한다
    name: "교사가 판정을 고친 학생",
    expectWeak: TRANSPOSE_KW,
    attempts: [
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-13", "x=-13/3"], expect: "SIGN", teacher: { errorType: "TRANSPOSE", memo: "물어보니 이항할 때 부호를 어떻게 바꾸는지 헷갈려서 그냥 더했다고 함" } },
      { q: "7 - 3x = 1", lines: ["7-3x=1", "-3x=1-7", "-3x=-8", "x=8/3"], expect: "SIGN", teacher: { errorType: "TRANSPOSE" } },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
      { q: "6x = 18", lines: ["6x=18", "x=3"], expect: "NONE" },
    ],
  },
  {
    name: "문장을 식으로 못 세우는 학생",
    expectWeak: ["문자식", "식으로", "식 세우", "의미", "문장"],
    attempts: [
      { q: WORD[0][0], lines: ["3(x-4)=11", "3x-12=11", "3x=23", "x=23/3"], expect: "EXPR_MEANING" },
      { q: WORD[1][0], lines: ["2x+5=18", "2x=13", "x=13/2"], expect: "EXPR_MEANING" },
      { q: WORD[2][0], lines: ["300+x+500=2600", "x=1800"], expect: "EXPR_MEANING" },
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=8", "x=4"], expect: "NONE" },
    ],
  },

  // ── 교사 설문에서 많이 꼽힌 실수 유형 8개 (ai.ts 의 TEACHER_PICKS): 유형마다 서로 다른 문항 3개에서 같은 실수 ──
  {
    // 'x 는 양수' 같은 조건이 있는데 조건에 맞지 않는 값까지 답함
    name: "[설문] 조건을 놓치는 학생",
    expectWeak: ["조건"],
    attempts: [
      { q: FREE.absPos.q, lines: ["3, -3"], expect: "CONDITION" },
      { q: FREE.absNeg.q, lines: ["|x|=5", "x=5, -5"], expect: "CONDITION" },
      { q: FREE.natural.q, lines: ["-1, 0, 1, 2"], expect: "CONDITION" },
      OK_2X3,
    ],
  },
  {
    // 식과 계산은 맞는데 x 만 구하고, 문제가 묻는 값(x + 3, 2x …)을 구하지 않음
    name: "[설문] 구하는 값을 혼동하는 학생",
    expectWeak: ["구하는 값", "묻는"],
    attempts: [
      { q: FREE.pear.q, lines: ["x+(x+3)=13", "2x+3=13", "2x=10", "x=5"], expect: "TARGET" },
      { q: FREE.brother.q, lines: ["x+2x=36", "3x=36", "x=12"], expect: "TARGET" },
      { q: FREE.width.q, lines: ["2(x+x+4)=32", "4x+8=32", "4x=24", "x=6"], expect: "TARGET" },
      OK_2X3,
    ],
  },
  {
    // (-2) × (-3) = -6, -8 + 5 = -13, 1 - 7 = -8
    name: "[설문] 음수 계산에서 부호를 틀리는 학생",
    expectWeak: SIGN_KW,
    attempts: [
      { q: FREE.negMul.q, lines: ["(-2)×(-3)+4", "=-6+4", "=-2"], expect: "SIGN" },
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-13", "x=-13/3"], expect: "SIGN" },
      { q: "7 - 3x = 1", lines: ["7-3x=1", "-3x=1-7", "-3x=-8", "x=8/3"], expect: "SIGN" },
      OK_2X3,
    ],
  },
  {
    // 2(x + 3) → 2x + 3
    name: "[설문] 괄호를 풀 때 일부 항에만 곱하는 학생",
    expectWeak: DISTRIBUTE_KW,
    attempts: [
      { q: "2(x + 3) = 14", lines: ["2(x+3)=14", "2x+3=14", "2x=11", "x=11/2"], expect: "DISTRIBUTE" },
      { q: "3(x - 2) = 9", lines: ["3(x-2)=9", "3x-2=9", "3x=11", "x=11/3"], expect: "DISTRIBUTE" },
      { q: "2(x - 3) = 4", lines: ["2(x-3)=4", "2x-3=4", "2x=7", "x=7/2"], expect: "DISTRIBUTE" },
      OK_2X3,
    ],
  },
  {
    // -(x + 3) → -x + 3 (괄호가 없는 분배는 맞게 함)
    name: "[설문] 괄호 앞 음수의 부호를 틀리는 학생",
    expectWeak: PAREN_SIGN_KW,
    attempts: [
      { q: "-(x + 3) = 5", lines: ["-(x+3)=5", "-x+3=5", "-x=2", "x=-2"], expect: "PAREN_SIGN" },
      { q: "7 - (x - 2) = 4", lines: ["7-(x-2)=4", "7-x-2=4", "5-x=4", "-x=-1", "x=1"], expect: "PAREN_SIGN" },
      { q: "5 - (2x + 1) = 10", lines: ["5-(2x+1)=10", "5-2x+1=10", "6-2x=10", "-2x=4", "x=-2"], expect: "PAREN_SIGN" },
      { q: "2(x - 3) = 4", lines: ["2(x-3)=4", "2x-6=4", "2x=10", "x=5"], expect: "NONE" },
    ],
  },
  {
    // x = -2 를 x² 에 넣어 -2² = -4, 5 - x 에 넣어 5 - 2 (양수 대입은 맞게 함)
    name: "[설문] 대입할 때 괄호를 빠뜨리는 학생",
    expectWeak: ["대입"],
    attempts: [
      { q: FREE.subSq.q, lines: ["-2²+3", "=-4+3", "=-1"], expect: "SUBSTITUTE" },
      { q: FREE.subSq2.q, lines: ["2×-3²", "=2×-9", "=-18"], expect: "SUBSTITUTE" },
      { q: FREE.subMinus.q, lines: ["5-2", "=3"], expect: "SUBSTITUTE" },
      { q: FREE.subPos.q, lines: ["2×3+1", "=6+1", "=7"], expect: "NONE" },
    ],
  },
  {
    // 2x + 3 = 11 → 2x = 11 + 3
    name: "[설문] 이항할 때 부호를 틀리는 학생",
    expectWeak: TRANSPOSE_KW,
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11+3", "2x=14", "x=7"], expect: "TRANSPOSE" },
      { q: "3x + 4 = 19", lines: ["3x+4=19", "3x=19+4", "3x=23", "x=23/3"], expect: "TRANSPOSE" },
      { q: "4x - 9 = 15", lines: ["4x-9=15", "4x=15-9", "4x=6", "x=3/2"], expect: "TRANSPOSE" },
      OK_6X,
    ],
  },
  {
    // 이항은 맞는데 (2x = 11 - 3) 다음 줄 계산을 틀림 (2x = 6). 음수는 끼지 않음
    name: "[설문] 덧셈·뺄셈 계산을 틀리는 학생",
    expectWeak: ["덧셈", "뺄셈"],
    attempts: [
      { q: "2x + 3 = 11", lines: ["2x+3=11", "2x=11-3", "2x=6", "x=3"], expect: "ARITH" },
      { q: "3x + 4 = 19", lines: ["3x+4=19", "3x=19-4", "3x=14", "x=14/3"], expect: "ARITH" },
      { q: "4x - 9 = 15", lines: ["4x-9=15", "4x=15+9", "4x=23", "x=23/4"], expect: "ARITH" },
      OK_6X,
    ],
  },
  {
    // 괄호 실수 두 가지를 따로 잡는지: 일부 항에만 곱함 2번 + 괄호 앞 음수 2번 → 약점 두 개
    name: "[설문] 괄호 실수 두 가지가 섞인 학생",
    expectWeak: [...DISTRIBUTE_KW, ...PAREN_SIGN_KW],
    expectWeakAll: [DISTRIBUTE_KW, PAREN_SIGN_KW],
    attempts: [
      { q: "2(x + 3) = 14", lines: ["2(x+3)=14", "2x+3=14", "2x=11", "x=11/2"], expect: "DISTRIBUTE" },
      { q: "-(x + 3) = 5", lines: ["-(x+3)=5", "-x+3=5", "-x=2", "x=-2"], expect: "PAREN_SIGN" },
      { q: "3(x - 2) = 9", lines: ["3(x-2)=9", "3x-2=9", "3x=11", "x=11/3"], expect: "DISTRIBUTE" },
      { q: "7 - (x - 2) = 4", lines: ["7-(x-2)=4", "7-x-2=4", "5-x=4", "-x=-1", "x=1"], expect: "PAREN_SIGN" },
      OK_2X3,
    ],
  },
  {
    // 비슷해 보이는 실수(음수 부호·덧셈·대입 괄호)가 한 번씩: 유형이 달라 약점으로 단정하면 안 된다
    name: "[설문] 비슷한 실수가 한 번씩인 학생",
    expectWeak: [],
    expectNoWeak: true,
    attempts: [
      { q: "3x - 5 = -8", lines: ["3x-5=-8", "3x=-8+5", "3x=-13", "x=-13/3"], expect: "SIGN" },
      { q: "3x + 4 = 19", lines: ["3x+4=19", "3x=19-4", "3x=14", "x=14/3"], expect: "ARITH" },
      { q: FREE.subSq.q, lines: ["-2²+3", "=-4+3", "=-1"], expect: "SUBSTITUTE" },
      OK_2X3,
      OK_6X,
    ],
  },
];

// 동시에 몇 개씩 호출 (API 속도 제한 대비)
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const label = (e: ErrorType) => `${e}(${ERROR_LABEL[e]})`;

async function runStudent(d: Dummy, idx: number, showJson: boolean, twice: boolean) {
  const studentId = `dummy-${idx}`;
  const t0 = Date.parse("2026-11-01T09:00:00+09:00");
  const graded = await pool(d.attempts, 4, async (a, i) => {
    const problem = problems.get(pid(a.q))!;
    const analysis = await analyzeSolution({ problem, ocrLines: a.lines, durationSec: 90, erases: 0 });
    const sub: Submission = {
      id: `${studentId}-s${i}`,
      studentId,
      problemId: problem.id,
      question: problem.question,
      startedAt: t0 + i * 3600_000,
      submittedAt: t0 + i * 3600_000 + 90_000,
      strokes: [],
      events: [],
      ocrLines: a.lines,
      status: analysis.needsReview ? "needs_review" : "done",
      analysis,
      ...(a.teacher ? { teacher: a.teacher } : {}),
    };
    return { a, sub };
  });

  console.log(`\n━━━━ ${d.name} ━━━━`);
  let gradeOk = 0;
  for (const { a, sub } of graded) {
    const got = sub.analysis!.errorType;
    // 판독 어려움은 needsReview 로 잡혔으면 통과
    const ok = got === a.expect || (a.expect === "UNREADABLE" && sub.status === "needs_review");
    if (ok) gradeOk++;
    const verdict = sub.analysis!.correct === null ? "보류" : sub.analysis!.correct ? "정답" : "오답";
    console.log(`  ${ok ? "✓" : "✗"} ${a.lines.join(" / ")}`);
    console.log(`      → ${verdict} · ${label(got)}${ok ? "" : `  (기대: ${label(a.expect)})`}${sub.status === "needs_review" ? " · 확인 필요" : ""}`);
    if (!ok) console.log(`      이유: ${sub.analysis!.reason}`);
  }

  const summary = await summarize({ studentId, name: d.name, problems, subs: graded.map((g) => g.sub), fingerprint: "test" });
  // --twice: 같은 기록으로 한 번 더 요약해 결과가 같은지 (temperature 0)
  let sameOk: boolean | null = null;
  if (twice) {
    const again = await summarize({ studentId, name: d.name, problems, subs: graded.map((g) => g.sub), fingerprint: "test" });
    sameOk = again.overview === summary.overview && JSON.stringify(again.weakConcepts) === JSON.stringify(summary.weakConcepts);
    if (!sameOk) console.log(`  (두 번째 요약) ${again.overview}\n  (두 번째 약점) ${again.weakConcepts.map((w) => `${w.concept}(${w.priority})`).join(", ")}`);
  }
  const weak = summary.weakConcepts.map((w) => `${w.concept}(${w.priority})`).join(", ") || "없음";
  const top = `${summary.weakConcepts[0]?.concept ?? ""} ${summary.overview.split(/(?<=[.!?요])\s/)[0]}`;
  const firstSentence = summary.overview.split(/(?<=[.!?요])\s/)[0];
  const weakOk = d.expectNoWeak
    ? // '반복되지 않았어요'·'반복된 실수가 없어요' 는 괜찮고, 반복했다고 단정하면 실패
      !summary.weakConcepts.some((w) => w.priority === "높음") && !/반복(했|됐|되었|되어|되며|되고|적)|부주의/.test(summary.overview)
    : d.expectWeak.some((k) => top.includes(k)) &&
      (!d.expectImproved || /다시|고쳤|고쳐|나아|바르게/.test(firstSentence)) &&
      (!d.expectImproved || summary.weakConcepts.every((w) => w.priority !== "높음")) &&
      (d.expectWeakAll ?? []).every((kws) => summary.weakConcepts.some((w) => w.priority === "높음" && kws.some((k) => w.concept.includes(k))));
  // 말투: 교사에게 해요체 ('~습니다', '~한다/~이다.' 로 끝나는 문장이 없어야)
  const texts = [summary.overview, ...summary.strengths, ...summary.weakConcepts.map((w) => w.evidence), ...summary.checkQuestions, ...summary.practice, ...summary.cautions];
  const badTone = texts.flatMap((t) => t.split(/(?<=[.!?])\s+/)).filter((t) => /습니다[.!]?$|[한이]다[.!]?$|있다[.!]?$|없다[.!]?$|된다[.!]?$/.test(t.trim()));
  console.log(`  요약: ${summary.overview}`);
  console.log(`  약점: ${weak}`);
  if (summary.cautions.length) console.log(`  확인할 점: ${summary.cautions.join(" / ")}`);
  console.log(
    `  ${weakOk ? "✓" : "✗"} 약점 판단 ${
      d.expectNoWeak ? "('높음' 약점·'반복'·'부주의'가 없어야 함)" : `(첫 약점·첫 문장에 ${d.expectWeak.join("/")} 중 하나${d.expectImproved ? ", 첫 문장에 다시 풀어 고친 변화, 고친 약점은 '높음' 아님" : ""})`
    }`,
  );
  // 내용 규칙: 다시 푼 문항이 없으면 다시 풀기 이야기 금지, 실수가 없으면 '한 번씩 실수' 금지, 같은 유형을 쪼개지 않기
  const subsList = graded.map((g) => g.sub);
  // 근거: 약점마다 근거 풀이가 있고, 근거 줄이 그 풀이에 실제로 있어야 한다
  const proofErrors = summary.weakConcepts.flatMap((w) =>
    !w.proofs?.length
      ? [`${w.concept}: 근거 없음`]
      : w.proofs
          .filter((p) => {
            const s = subsList.find((x) => x.id === p.submissionId);
            return !s || !(s.analysis?.correctedLines ?? s.ocrLines).includes(p.wrongLine);
          })
          .map((p) => `${w.concept}: 풀이에 없는 근거 줄 '${p.wrongLine}'`),
  );
  for (const w of summary.weakConcepts)
    for (const p of w.proofs ?? []) console.log(`    근거(${w.concept}): ${p.question} | ${p.prevLine ? `${p.prevLine} → ` : ""}${p.wrongLine}`);
  const hasRetry = new Set(subsList.map((x) => x.problemId)).size < subsList.length;
  const noMistake = d.attempts.every((a) => a.expect === "NONE");
  const prose = [summary.overview, ...summary.strengths, ...summary.cautions].join(" ");
  const ruleErrors = [
    !hasRetry && /다시 풀|고친 기록|고쳐졌/.test(prose) ? "다시 푼 문항이 없는데 다시 풀기 언급" : "",
    noMistake && /한 번씩|실수가 있었/.test(prose) ? "실수가 없는데 실수 언급" : "",
    new Set(summary.weakConcepts.map((w) => w.concept.split(/[-–(:]/)[0].trim())).size < summary.weakConcepts.length ? "같은 유형을 쪼갬" : "",
    ...proofErrors,
  ].filter(Boolean);
  console.log(`  ${ruleErrors.length ? "✗" : "✓"} 내용 규칙${ruleErrors.length ? `: ${ruleErrors.join(", ")}` : ""}`);
  console.log(`  ${badTone.length ? "✗" : "✓"} 말투 (해요체)${badTone.length ? `: ${badTone.slice(0, 3).join(" | ")}` : ""}`);
  if (sameOk !== null) console.log(`  ${sameOk ? "✓" : "✗"} 같은 기록으로 두 번 요약: ${sameOk ? "똑같음" : "달라짐"}`);
  if (showJson) console.log(JSON.stringify(summary, null, 2));
  return { gradeOk, gradeAll: graded.length, weakOk, toneOk: badTone.length === 0, ruleOk: ruleErrors.length === 0, sameOk };
}

async function main() {
  const args = process.argv.slice(2);
  const showJson = args.includes("--json");
  const twice = args.includes("--twice");
  const filter = args.find((a) => !a.startsWith("--"));
  const targets = STUDENTS.map((d, i) => ({ d, i })).filter(({ d }) => !filter || d.name.includes(filter));
  if (!targets.length) throw new Error(`'${filter}' 학생이 없어요. 있는 학생: ${STUDENTS.map((d) => d.name).join(", ")}`);

  const results = [];
  for (const { d, i } of targets) results.push(await runStudent(d, i, showJson, twice));

  const g = results.reduce((s, r) => s + r.gradeOk, 0);
  const ga = results.reduce((s, r) => s + r.gradeAll, 0);
  const w = results.filter((r) => r.weakOk).length;
  const t = results.filter((r) => r.toneOk).length;
  console.log(`\n━━━━ 결과 ━━━━\n  채점·오류 유형: ${g}/${ga} 맞음\n  학생별 약점 판단: ${w}/${results.length} 맞음\n  말투(해요체): ${t}/${results.length} 맞음\n  내용 규칙: ${results.filter((r) => r.ruleOk).length}/${results.length} 맞음${twice ? `\n  두 번 요약 같음: ${results.filter((r) => r.sameOk).length}/${results.length}` : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });

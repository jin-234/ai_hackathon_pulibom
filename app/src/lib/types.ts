// 공통 타입 정의

export type ErrorType =
  | "SIGN" // 부호·정수 계산 (음수가 낀 계산)
  | "PAREN_SIGN" // 괄호 앞 음수의 부호
  | "DISTRIBUTE" // 괄호 풀기 (일부 항에만 곱함)
  | "LIKE_TERMS" // 동류항 정리
  | "TRANSPOSE" // 등식 변형·이항
  | "DIVIDE" // 계수 나누기
  | "SUBSTITUTE" // 값을 대입할 때 괄호
  | "EXPR_MEANING" // 문자식 의미
  | "CONDITION" // 문제의 조건을 놓침
  | "TARGET" // 구하는 값을 혼동
  | "FRACTION" // 분수 계산 (통분·약분·역수)
  | "ARITH" // 자연수·소수 계산, 계산 순서
  | "FORMULA" // 넓이·부피·비율·평균 등 공식·개념 적용
  | "COPY" // 옮겨 적기 (문제를 옮겨 적다 바꿈, 구한 값과 다른 답을 씀)
  | "UNREADABLE" // 판독 불가
  | "NONE"; // 오류 없음

// 이 값보다 낮은 줄은 OCR이 잘못 읽었을 가능성이 크다 (테스트에서 '-4'→'4' 처럼 부호를 놓친 줄이 0.63~0.66)
export const LOW_OCR_CONFIDENCE = 0.7;

export const ERROR_LABEL: Record<ErrorType, string> = {
  SIGN: "부호·정수 계산",
  PAREN_SIGN: "괄호 앞 음수 부호",
  DISTRIBUTE: "괄호 풀기(분배)",
  LIKE_TERMS: "동류항 정리",
  TRANSPOSE: "등식 변형·이항",
  DIVIDE: "계수 나누기",
  SUBSTITUTE: "대입할 때 괄호",
  EXPR_MEANING: "문자식 의미",
  CONDITION: "조건 놓침",
  TARGET: "구하는 값 혼동",
  FRACTION: "분수 계산",
  ARITH: "기본 계산·계산 순서",
  FORMULA: "공식·개념 적용",
  COPY: "옮겨 적기 실수",
  UNREADABLE: "판독 어려움",
  NONE: "오류 없음",
};

// 문항의 미지수: 중학교에서 자주 쓰는 x, y, a, b, m, n, i 중 문항(정답 'y=3' 또는 문제)에 나온 글자.
// 문자가 없는 계산 문항이면 "" (× 를 x 로 바꾸지 않게). cm·kg 처럼 두 글자 이상 붙은 단위는 빼고 한 글자로 떨어진 것만 센다
const VARIABLES = ["x", "y", "a", "b", "m", "n", "i"];
export function variableOf(problem: { question: string; answer: string }): string {
  const ans = problem.answer.replace(/\s/g, "").match(/^([a-z])=/)?.[1];
  if (ans && VARIABLES.includes(ans)) return ans;
  const count = new Map<string, number>();
  for (const m of problem.question.matchAll(/(?<![A-Za-z])([a-z])(?![A-Za-z])/g)) if (VARIABLES.includes(m[1])) count.set(m[1], (count.get(m[1]) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// 글씨체 문제: OCR 이 이상하게 읽은 풀이 (수학 실수와는 따로 센다)
//  - OCR 원문에 수식·한글 답에 안 나오는 글자가 있음 ('つく', '吕', '☑', '←'), 미지수·단위가 아닌 영문자 ('JC', '7c')
//  - 성립할 수 없는 숫자 등식 ('20=3': x 를 숫자로 읽음)
//  - 보정 단계가 글자를 고쳐야 했음 ('27c' → '2x'), 보정 뒤에도 '?' 가 남음, OCR 신뢰도가 낮음
//  - 분석은 끝났는데 OCR 이 아무것도 못 읽음 (nothingRead)
// OCR 줄에 나와도 되는 글자 (이 밖의 글자: つ·次 등 → 글씨를 잘못 읽은 것)
export const OCR_ALLOWED = /^[0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ+\-=().,/×÷²³π√%:|<>≤≥'\s]*$/;
const ALLOWED = OCR_ALLOWED;
const UNITS = ["cm", "mm", "km", "m", "kg", "g", "L", "mL", "ml"];
// 숫자끼리 "2=4" 처럼 성립하지 않는 등식 (x 를 숫자로 잘못 읽은 흔적)
export function falseNumberEquation(line: string) {
  const m = line.replace(/\s/g, "").match(/^(-?\d+(?:\.\d+)?(?:\/\d+)?)=(-?\d+(?:\.\d+)?(?:\/\d+)?)$/);
  if (!m) return false;
  const val = (t: string) => (t.includes("/") ? Number(t.split("/")[0]) / Number(t.split("/")[1]) : Number(t));
  return Math.abs(val(m[1]) - val(m[2])) > 1e-9;
}
export function handwritingIssue(
  s: Pick<Submission, "ocrLines" | "ocrConfidence" | "analysis" | "question" | "status" | "visionRead">,
): { lines: number[]; nothingRead: boolean } {
  const v = variableOf({ question: s.question ?? "", answer: "" });
  const norm = (l: string) => l.replace(/\s/g, "").replace(/[×✕χX]/g, "x");
  const strayLetters = (l: string) =>
    (l.match(/[a-zA-Z]+/g) ?? []).some((w) => !(w === v || w.toLowerCase() === v) && !UNITS.includes(w));
  const lines = s.ocrLines
    .map((raw, i) => {
      const fixed = s.analysis?.correctedLines?.[i] ?? raw;
      // AI 가 다시 읽은 풀이: OCR 신뢰도·보정 차이는 보지 않고, AI 도 못 읽은 흔적(?, 이상한 글자)만 글씨체 문제로
      if (s.visionRead) return fixed.includes("?") || raw.includes("?") || !ALLOWED.test(raw) || strayLetters(raw) ? i : -1;
      const odd =
        !ALLOWED.test(raw) ||
        strayLetters(raw) ||
        falseNumberEquation(fixed) ||
        fixed.includes("?") ||
        (s.ocrConfidence?.[i] ?? 1) < LOW_OCR_CONFIDENCE ||
        norm(fixed) !== norm(raw);
      return odd ? i : -1;
    })
    .filter((i) => i >= 0);
  // 분석이 끝났는데 읽은 줄이 하나도 없음 (목록 조회에는 획 기록이 빠져 있어 상태로 판단)
  const nothingRead = s.ocrLines.length === 0 && s.status !== "pending";
  return { lines, nothingRead };
}
export const hasHandwritingIssue = (s: Parameters<typeof handwritingIssue>[0]) => {
  const h = handwritingIssue(s);
  return h.lines.length > 0 || h.nothingRead;
};

export type Problem = {
  id: string;
  title: string;
  question: string; // 화면에 보여줄 식 또는 문장형 문제
  free?: boolean; // 일차방정식 풀이기로 풀 수 없는 자유 입력 문항
  answer: string; // 예: "x=3" (자유 문항은 비어 있을 수 있음)
  concept: string; // 관련 개념
  solution: string[]; // 교사 검토 해설 (단계별)
  templateId?: string; // 문제은행 틀에서 만든 문항이면 그 틀
};

export type Point = { x: number; y: number; t: number };

export type Stroke = {
  id: string;
  tool: "pen" | "pencil" | "highlighter";
  color: string;
  width: number;
  alpha?: number;
  points: Point[];
};

export type InkEvent =
  | { type: "add"; strokeId: string; t: number }
  | { type: "erase"; strokeId: string; t: number }
  | { type: "undo"; strokeId: string; t: number }
  | { type: "clear"; t: number }
  | { type: "hidden" | "visible"; t: number };

export type AnalysisStatus = "pending" | "done" | "needs_review" | "error";

export type Analysis = {
  correctedLines: string[]; // OCR 오인식을 문맥으로 보정한 풀이 (OCR 줄과 1:1)
  recognizedAnswer: string | null; // 풀이 마지막에서 AI가 읽어 낸 답
  correct: boolean | null;
  firstErrorLine: number | null; // OCR 줄 번호 (0부터), 없으면 null
  errorType: ErrorType;
  concept: string;
  reason: string;
  suggestion: string;
  needsReview: boolean;
  model: string;
};

export type Submission = {
  id: string;
  studentId: string;
  problemId: string;
  question?: string; // 제출 당시 문항 식 (과제가 바뀌어도 보이도록)
  concept?: string; // 문항의 관련 개념 (풀이 기록에서 무슨 항목인지 먼저 보여 준다)
  problemAnswer?: string; // 문항에 선생님이 정한 정답 (교사 화면: 학생 답과 나란히)
  startedAt: number;
  submittedAt: number;
  strokes: Stroke[];
  events: InkEvent[];
  ocrLines: string[];
  ocrConfidence?: number[]; // 줄별 OCR 신뢰도 (ocrLines 와 1:1)
  ocrRaw?: unknown;
  visionRead?: boolean; // OCR 이 확신 없어 이미지 입력 AI(Gemini·Claude)가 다시 읽은 풀이 (ocr_raw.pulibomVision 이 있음)
  status: AnalysisStatus;
  statusMessage?: string;
  analysis?: Analysis;
  teacher?: { errorType?: ErrorType; memo?: string; confirmedAt?: number; by?: string };
  origin?: SubmissionOrigin; // 어느 학년도·반 과제의 풀이인지 (기본 시연 문항으로 낸 예전 풀이는 없음)
  readOnly?: boolean; // 교사 화면: 지난 학년·보관된 반 기록이라 고칠 수 없음
};

export type SubmissionOrigin = {
  classId: string;
  className: string;
  schoolYear: number;
  archived: boolean;
  teachers: string; // 그 반 담당 교사 이름
};

// 학습 로그에서 계산한 보조 지표
export function inkStats(s: Pick<Submission, "startedAt" | "submittedAt" | "events">) {
  const durationSec = Math.round((s.submittedAt - s.startedAt) / 1000);
  const erases = s.events.filter((e) => e.type === "erase" || e.type === "undo" || e.type === "clear").length;
  const times = [s.startedAt, ...s.events.map((e) => e.t), s.submittedAt].sort((a, b) => a - b);
  let idleSec = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] - times[i - 1]) / 1000;
    if (gap >= 30) idleSec += gap; // 30초 이상 무입력 구간
  }
  const hiddenCount = s.events.filter((e) => e.type === "hidden").length;
  return { durationSec, erases, idleSec: Math.round(idleSec), hiddenCount };
}

// ── 과제 ──────────────────────────────────────────────
export type Assignment = {
  id: string;
  classId: string; // 어느 반 과제인지
  title: string; // 예: "수학 1-1 · 일차방정식"
  createdAt: number;
  published: boolean; // 학생 목록에 공개
  closedAt?: number; // 교사가 직접 마감한 시각
  dueAt?: number; // 예약된 마감 시각
  problems: Problem[];
  studentIds?: string[]; // 정해진 학생에게만 배정 (없으면 반 전체)
  supplement?: SupplementInfo; // 보충 과제일 때
  kind?: "diagnostic"; // 예전 입학 레벨 테스트 과제 (기능은 뺐고 DB 에 남은 것을 거르는 데만 쓴다)
};

// 보충 과제: 어떤 풀이(오류)를 보고 만들었는지 기록해 두고 전후를 비교한다
//  - 개인 보충: studentId 한 명 / 소그룹 보충: studentIds 여러 명 (결과·변화 분석은 학생마다 따로)
export type SupplementInfo = {
  studentId?: string;
  studentIds?: string[];
  group?: string; // 소그룹 이름 (예: "등식 변형·이항 반복 오류")
  concept: string;
  targetError: ErrorType | null;
  sourceSubmissionIds: string[]; // 보충 전 근거 풀이 (그룹이면 학생들 풀이가 섞여 있음)
  review?: SupplementReview; // AI 변화 분석 (예전 개인 보충)
  reviews?: Record<string, SupplementReview>; // 학생별 AI 변화 분석
};

// 이 보충 과제의 대상 학생
export function supplementStudents(sup: SupplementInfo | undefined): string[] {
  if (!sup) return [];
  return sup.studentIds?.length ? sup.studentIds : sup.studentId ? [sup.studentId] : [];
}

export function supplementReviewOf(sup: SupplementInfo, studentId: string): SupplementReview | undefined {
  return sup.reviews?.[studentId] ?? (sup.studentId === studentId ? sup.review : undefined);
}

export type SupplementReview = {
  generatedAt: number;
  model: string;
  verdict: "개선" | "부분 개선" | "아직 반복" | "판단 보류";
  summary: string;
  remaining: string[];
  nextStep: string;
};

export function visibleTo(a: Pick<Assignment, "studentIds">, studentId: string) {
  return !a.studentIds?.length || a.studentIds.includes(studentId);
}

export type AssignmentStatus = "draft" | "open" | "scheduled" | "closed";

// 비공개 / 진행 중 / 마감 예약됨(진행 중) / 마감
export function statusOf(a: Pick<Assignment, "published" | "closedAt" | "dueAt">, now = Date.now()): AssignmentStatus {
  if (!a.published) return "draft";
  if (a.closedAt || (a.dueAt && now >= a.dueAt)) return "closed";
  return a.dueAt ? "scheduled" : "open";
}

export function formatDue(ms: number) {
  return new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

// ── 학급 대시보드용 학생별 지표 ──────────────────────────
export type Trend = "개선" | "유지" | "확인 필요" | "-";

export type StudentStats = {
  id: string;
  name: string;
  submitted: number; // 제출한 문항 수 (문항 단위, 다시 제출은 1개로)
  total: number; // 대상 문항 수
  judged: number; // AI가 정오를 판정한 문항 수
  accuracy: number | null; // 판정된 문항 중 정답 비율 %
  avgSec: number | null; // 문항당 평균 풀이 시간
  weakConcept: string | null; // 틀린 문항에서 가장 많이 나온 개념
  repeatedError: ErrorType | null; // 2번 이상 나온 오류 유형
  topError: ErrorType | null; // 가장 많이 나온 오류 유형 (1번이어도) → 소그룹 묶기 기준
  repeatedCount: number;
  reviewCount: number; // 교사 확인이 필요한 풀이 (판독 어려움·분석 오류, 교사 미확인)
  trend: Trend;
  attempts: number; // 실제 제출 건수 (다시 제출 포함)
  lastSubmittedAt: number | null; // 마지막으로 제출한 시각 (ms)
  assignmentsDone?: number; // 받은 과제 중 문항을 다 낸 과제 수 (제출 현황)
  assignmentsTotal?: number; // 받은 과제 수
  conceptHistory: { concept: string; before: number; after: number | null; n: number }[];
};

export type ClassStats = {
  source: "real";
  classId: string | null;
  archived: boolean; // 보관된 반 (읽기 전용)
  assignmentId: string | null;
  period?: { from: number | null; to: number | null }; // 기간 필터 (제출 시각, ms)
  assignments: { id: string; title: string; problemIds: string[] }[]; // problemIds: 과제를 골랐을 때 풀이 기록을 그 과제 문항으로 거르는 데 쓴다
  students: StudentStats[];
};

// ── AI 학습 요약 (학생별) ────────────────────────────────
// 약점의 근거: 실제 풀이에서 가져온 틀린 줄 (AI 가 고른 풀이를 코드가 그 학생 기록에서 확인해 넣는다)
export type WeakProof = {
  submissionId: string;
  question: string;
  wrongLine: string; // 첫 오류 줄 (학생이 쓴 식 그대로)
  prevLine?: string; // 그 바로 앞 줄 (무엇을 무엇으로 바꿨는지 보이게)
  reason: string; // 채점 때 AI 가 쓴 근거
  teacherChecked: boolean; // 교사가 오류 유형을 확인·수정한 풀이
};

export type StudentSummary = {
  studentId: string;
  generatedAt: number;
  model: string;
  basedOn: number; // 요약에 쓴 풀이 수
  fingerprint: string; // 요약 당시 풀이 상태 (바뀌면 '다시 요약' 안내)
  overview: string; // 2~3문장 요약
  strengths: string[];
  weakConcepts: { concept: string; evidence: string; priority: "높음" | "보통" | "낮음"; proofs?: WeakProof[] }[];
  checkQuestions: string[]; // 교사가 학생에게 던질 확인 질문
  practice: string[]; // 보충 연습 방향
  cautions: string[]; // 판독 어려움·근거 부족 등 교사가 직접 확인할 점
  // 고등학생: 틀린 풀이를 다시 봐야 할 중학 기초 테마로 묶은 것 (foundations.ts, 코드가 센다. 많은 순)
  foundations?: { no: number; name: string; covers: string; count: number; problems: number; examples: string[] }[];
};

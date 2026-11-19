import { chat } from "./ai";
import { getAssignment, listAssignments, setSupplementReview } from "./assignments";
import { makeVariants, solveLinear } from "./equation";
import { draftConceptProblems, sameNumbers } from "./unitProblems";
import { getStudentGrade } from "./roster";
import { gradeName } from "./curriculum";
import type { Figure } from "./figure";
import { describeAdapt, getProfile, intersectProfiles, toAdapt, type Adapt, type LearningProfile } from "./learningProfile";
import { pickFromBank } from "./problemBank";
import { env } from "./env";
import { PROBLEMS } from "./problems";
import { listSubmissions } from "./store";
import { correctOf } from "./verdict";
import { getSummary } from "./summary";
import {
  ERROR_LABEL,
  statusOf,
  supplementReviewOf,
  supplementStudents,
  type Assignment,
  type ErrorType,
  type Problem,
  type Submission,
  type SupplementReview,
} from "./types";

// ── 보충 지도: 문항 생성 → (교사 확인) → 개별 배정 → 재풀이 → 변화 분석 ──

// 보충 문항 수: 교사가 1~10개 중에서 고른다
export const MAX_SUPPLEMENT = 10;
export function supplementCount(v: unknown, fallback: number) {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_SUPPLEMENT, Math.max(1, n)) : fallback;
}

const NOT_AN_ERROR: ErrorType[] = ["NONE", "UNREADABLE"];
const errorOf = (s: Submission): ErrorType | null => {
  const e = s.teacher?.errorType ?? s.analysis?.errorType ?? null;
  return e && !NOT_AN_ERROR.includes(e) ? e : null;
};

// 보충 근거가 되는 문항
async function problemIndex() {
  const map = new Map<string, Problem>();
  for (const a of await listAssignments()) for (const p of a.problems) map.set(p.id, p);
  for (const p of PROBLEMS) if (!map.has(p.id)) map.set(p.id, p);
  return map;
}

export type SupplementCandidate = {
  question: string;
  answer: string;
  concept: string;
  why: string;
  source: "bank" | "ai" | "rule";
  templateId?: string; // 문제은행 틀에서 만든 문항
  calc?: boolean; // 식이 아니라 정답을 따로 정해 준 문항 (문장제 등)
  figure?: Figure; // 문항 그림 (AI 설계도 또는 선생님이 올린 이미지)
};
export type SupplementDraft = {
  concept: string;
  targetError: ErrorType | null;
  sourceSubmissionIds: string[];
  basis: string[]; // 근거로 쓴 오답 풀이 (교사 화면 표시용)
  candidates: SupplementCandidate[];
  adapted: string[]; // 학습 기록을 보고 문제 선택에 반영한 것 (교사 화면 표시용)
  profile?: LearningProfile; // 개인 보충일 때 그 학생의 학습 프로필
};

// 학생 한 명의 오답 (문항별 최신 풀이 중 틀렸거나 교사가 오류 유형을 지정한 것)
function wrongOf(studentId: string, subs: Submission[], problems: Map<string, Problem>) {
  const latest = new Map<string, Submission>();
  for (const s of subs.filter((x) => x.studentId === studentId).sort((a, b) => a.submittedAt - b.submittedAt)) latest.set(s.problemId, s);
  return [...latest.values()].filter((s) => problems.has(s.problemId) && (correctOf(s) === false || errorOf(s)));
}

// 가장 많이 나온 오류. skip(이미 극복한 오류)은 다른 오류가 있으면 건너뛴다
function mostCommonError(subs: Submission[], skip: Set<ErrorType> = new Set()): ErrorType | null {
  const counts = new Map<ErrorType, number>();
  for (const s of subs) {
    const e = errorOf(s);
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([e]) => e);
  return ranked.find((e) => !skip.has(e)) ?? ranked[0] ?? null;
}

function describeBasis(subs: Submission[], problems: Map<string, Problem>) {
  return subs.map((s) => {
    const p = problems.get(s.problemId);
    const lines = (s.analysis?.correctedLines?.length ? s.analysis.correctedLines : s.ocrLines).join(" → ");
    return `${p?.question ?? s.question ?? ""} : ${lines || "(인식 실패)"}${s.analysis?.reason ? ` (${s.analysis.reason})` : ""}`;
  });
}

// ── 틀린 단계의 개념 위주 보충 (인수분해·정수 계산처럼 일차방정식 풀이기로 만들 수 없는 개념) ──
// 근거 풀이에서 가장 많이 나온 '틀린 단계의 개념' (채점 때 AI 가 errorConcept 로 남김). 없으면 문항 개념
function stepConcept(subs: Submission[], problems: Map<string, Problem>): string | null {
  const counts = new Map<string, number>();
  for (const s of subs) {
    const c = s.analysis?.errorConcept || s.analysis?.concept || problems.get(s.problemId)?.concept;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
const isLinearProblem = (p: Problem | undefined) => {
  if (!p) return false;
  if (/^[a-z]=/.test(p.answer.replace(/\s/g, ""))) return true; // 답이 x = … 인 문장제
  try {
    solveLinear(p.question);
    return true;
  } catch {
    return false;
  }
};
// 일차방정식(등식의 성질·이항)을 틀린 게 아니고, 근거 풀이에 일차방정식이 아닌 문항이 있으면 개념 위주 보충으로 간다
// (중1 일차방정식에서 괄호 풀기를 틀린 것은 지금처럼 문제은행·풀이기 경로가 더 정확하다)
function needsConceptPath(concept: string | null, subs: Submission[], problems: Map<string, Problem>) {
  if (!concept || (/일차방정식|등식의\s*성질|이항/.test(concept) && !/이차|연립|부등식/.test(concept))) return false;
  return subs.some((s) => !isLinearProblem(problems.get(s.problemId)));
}
async function conceptCandidates(grade: number, concept: string, basis: string[], problems: Map<string, Problem>, count: number): Promise<SupplementCandidate[]> {
  const existing = new Set([...problems.values()].map((p) => p.question.replace(/\s/g, "")));
  const items = (await draftConceptProblems({ grade, concept, basis, count: count + 1 })).filter((it) => !existing.has(it.question.replace(/\s/g, "")));
  if (!items.length) throw new Error("보충 문항을 만들지 못했어요. 다시 시도하거나 직접 입력해 주세요.");
  return items.slice(0, count).map((it) => ({
    question: it.question,
    answer: it.answer,
    concept,
    why: it.doubt ? `⚠ 검산이 어긋났어요. 정답을 꼭 확인해 주세요 (${it.doubt})` : `풀이에서 틀린 '${concept}' 단계를 직접 연습하는 문항이에요.`,
    source: "ai" as const,
    calc: true, // 풀이기로 못 푸니 AI 가 정하고 검산한 정답을 그대로 쓴다
    ...(it.figure ? { figure: it.figure } : {}),
  }));
}

// 식의 모양 (숫자를 n 으로): '5x - 2 = 38' 과 '7x - 8 = 20' 은 같은 모양 → AI 문항은 이미 고른 문항과 모양이 같으면 버린다
const shapeOf = (q: string) => q.replace(/\s/g, "").replace(/\d+/g, "n");
// 말이 붙은 식에서 식만 ("다음 방정식을 푸세요. 3x + 2 = 8" → "3x + 2 = 8")
const equationIn = (t: string) => t.match(/[\dx+\-*()=\s×÷−]*=[\dx+\-*()\s×÷−]*/)?.[0].trim() ?? "";

// 보충 문항 후보 채우기 (숫자만 바꾼 같은 모양 문항이 줄줄이 나오지 않게)
//  ① 문제은행: 약점(오류 유형·개념)에 맞는 틀을 하나씩, 난이도를 섞어서 → 문항의 약 2/3
//  ② AI: 같은 개념·오류를 다른 모양으로 (문장제, 좌우가 바뀐 식, 괄호·양변 x 등) → 나머지 약 1/3, 문장제는 1개 이상
//     문장제는 AI가 함께 준 방정식을 풀이기로 풀어 정답을 정하고, 다른 AI가 문장만 보고 다시 풀어 같은 답인지 확인
//  ③ 그래도 모자라면 문제은행 나머지 틀 → 마지막에만 오답 문항의 숫자 바꾸기
// 식 문항은 모두 풀이기로 검증 (0이 아닌 정수 해, 이미 낸 문항·중복 제외)
async function fillCandidates(opts: {
  concept: string;
  targetError: ErrorType | null;
  basisSubs: Submission[];
  basis: string[];
  problems: Map<string, Problem>;
  count: number;
  practice?: string[];
  useAi?: boolean;
  adapt?: Adapt;
  grade?: number | null;
}): Promise<SupplementCandidate[]> {
  const { concept, targetError, basisSubs, basis, problems, count } = opts;
  const existing = new Set([...problems.values()].map((p) => p.question.replace(/\s/g, "")));
  const seen = new Set<string>();
  const candidates: SupplementCandidate[] = [];
  const accept = (q: string, why: string, source: SupplementCandidate["source"], extra: { concept?: string; templateId?: string } = {}) => {
    try {
      const s = solveLinear(q);
      const key = s.question.replace(/\s/g, "");
      if (!Number.isInteger(s.answerValue) || s.answerValue === 0 || Math.abs(s.answerValue) > 30 || seen.has(key) || existing.has(key)) return;
      seen.add(key);
      candidates.push({ question: s.question, answer: s.answer, concept: extra.concept ?? s.concept, why, source, ...(extra.templateId ? { templateId: extra.templateId } : {}) });
    } catch {
      // 일차방정식이 아니면 버린다
    }
  };

  // ① 문제은행 (AI 몫을 남겨 둔다)
  const useAi = opts.useAi !== false;
  const aiShare = useAi && count >= 2 ? Math.max(1, Math.round((count - candidates.length) / 3)) : 0;
  const fromBank = async (n: number) => {
    if (n <= 0) return;
    try {
      const usedTemplates = new Set(candidates.flatMap((c) => (c.templateId ? [c.templateId] : [])));
      for (const it of await pickFromBank({ targetError, concept, count: n, exclude: new Set([...existing, ...seen]), adapt: opts.adapt, usedTemplates }))
        accept(it.question, it.why, "bank", { concept: it.concept, templateId: it.templateId });
    } catch {
      // 문제은행 테이블이 아직 없으면 (db:setup 전) 건너뛴다
    }
  };
  await fromBank(count - candidates.length - aiShare);

  // ② AI: 같은 개념·오류를 다른 모양으로
  if (candidates.length < count && useAi) {
    const want = count - candidates.length;
    const shown = candidates.map((c) => c.question);
    const shapes = new Set(candidates.filter((c) => !c.calc).map((c) => shapeOf(c.question)));
    // 문항마다 모양을 정해 준다 (첫 문항은 문장제)
    const FORMS = ["문장제", "좌우가 바뀐 식 (c = ax + b 꼴)", "괄호가 있는 식 (k(x + m) = c 꼴)", "양변에 x 가 있는 식", "상수항이 앞에 오는 식 (b - ax = c 꼴)", "문장제"];
    const plan = Array.from({ length: want + 2 }, (_, i) => FORMS[i % FORMS.length]);
    const system = `너는 ${gradeName(opts.grade ?? 1)} 수학 보충 문항을 만드는 도우미다. 학생이 틀린 단계(오류 유형)를 다시 거치게 하되, 이미 고른 문항과 '숫자만 다른' 문항은 만들지 않는다.
규칙:
- 문항마다 정해 준 모양으로 만든다. 문장제는 생활 상황(나이, 물건값, 개수, 거리 등)을 읽고 일차방정식을 세워 푸는 문제다.
- 이미 고른 문항과 숫자만 다른 같은 모양의 식은 만들지 않는다.
- 식 문항은 question 에 식만 쓴다 ("~을 구하세요" 같은 말을 붙이지 않는다). 숫자는 매번 새로 정한다 (예시 숫자를 그대로 쓰지 않는다).
- equation 에는 그 문항을 푸는 일차방정식을 x 하나로 쓴다 (숫자, x, + - ( ) = 만). 식 문항이면 question 과 같게 쓴다.
- 해는 0이 아닌 정수 (-30~30). 문장제는 답이 상황에 맞게 (개수·나이는 양수).
- 문장제의 question 은 "~을 구하세요."로 끝나는 한두 문장. x 라는 글자는 쓰지 않는다.
- why 에는 이 문항이 어떤 오류를 어떻게 확인하는지 50자 안쪽 한 문장 (교사용, 존댓말).
- JSON만 출력: {"items": [{"question": "...", "equation": "...", "why": "..."}]}`;
    const user = `[보충할 개념] ${concept}
[반복된 오류 유형] ${targetError ? ERROR_LABEL[targetError] : "특정되지 않음"}
[학생의 오답 풀이]
${basis.join("\n") || "(없음)"}
${opts.practice?.length ? `[AI 요약의 보충 연습 방향]\n${opts.practice.join("\n")}\n` : ""}${shown.length ? `[이미 고른 문항 — 이것과 모양이 다르게]\n${shown.join("\n")}\n` : ""}보충 문항 ${plan.length}개를 아래 모양 순서대로 만들어라.
${plan.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    try {
      // 가끔 응답이 같은 말을 되풀이하다 잘려 JSON이 깨진다 → 한 번 더 요청
      let parsed: { items?: { question?: string; equation?: string; why?: string }[] } = {};
      for (let attempt = 0; attempt < 2 && !parsed.items?.length; attempt++) {
        try {
          parsed = JSON.parse((await chat(system, user, attempt ? 0.4 : 0.7)).match(/\{[\s\S]*\}/)?.[0] ?? "{}");
        } catch {
          parsed = {};
        }
      }
      const words: { question: string; answer: string; concept: string; why: string }[] = [];
      const items = parsed.items ?? [];
      // 문장제 자리(1개)를 남겨 두고 식 문항을 받는다
      const room = count - 1;
      for (const it of items) {
        const eq = String(it.equation ?? "").trim();
        let q = String(it.question ?? "").trim();
        if (!q) continue;
        // "다음 방정식을 푸세요. 3x + 2 = 8" 처럼 식에 말이 붙어 오면 식만 (문장제에는 등호가 없다)
        if (q.includes("=")) q = equationIn(q) || eq;
        // 식 문항: 그대로 풀이기로
        if (/^[\dx+\-*()=\s×÷−]+$/.test(q)) {
          if (candidates.length >= room || shapes.has(shapeOf(q))) continue;
          const before = candidates.length;
          accept(q, String(it.why ?? ""), "ai");
          if (candidates.length > before) shapes.add(shapeOf(candidates[candidates.length - 1].question));
          continue;
        }
        // 문장제: 함께 준 방정식을 풀이기로 풀어 정답을 정한다
        try {
          const s = solveLinear(eq);
          const key = q.replace(/\s/g, "");
          if (!Number.isInteger(s.answerValue) || s.answerValue === 0 || Math.abs(s.answerValue) > 30 || seen.has(key)) continue;
          words.push({ question: q, answer: String(s.answerValue), concept: s.concept, why: `${String(it.why ?? "")} (식: ${s.question})`.trim() });
        } catch {
          // 방정식이 깨졌으면 버린다
        }
      }
      // 문장제는 다른 AI가 문장만 보고 다시 풀어, 같은 답이 나온 것만 쓴다
      for (const w of await verifyWordProblems(words, opts.grade)) {
        if (candidates.length >= count) break;
        seen.add(w.question.replace(/\s/g, ""));
        candidates.push({ ...w, source: "ai", calc: true });
      }
      // 문장제가 검산에서 다 빠졌으면 남겨 둔 자리는 식 문항으로
      for (const it of items) {
        const raw = String(it.question ?? "").trim();
        const q = raw.includes("=") ? equationIn(raw) || String(it.equation ?? "") : raw;
        if (candidates.length >= count) break;
        if (!/^[\dx+\-*()=\s×÷−]+$/.test(q) || shapes.has(shapeOf(q))) continue;
        accept(q, String(it.why ?? ""), "ai");
        shapes.add(shapeOf(q));
      }
    } catch {
      // AI 실패 시 아래로 채운다
    }
  }

  // ③ 문제은행 나머지 틀 → 마지막에만 오답 문항 숫자 바꾸기
  await fromBank(count - candidates.length);

  // ③ 오답 문항 숫자 바꾸기
  for (const s of basisSubs) {
    const p = problems.get(s.problemId);
    if (!p || p.free || candidates.length >= count) continue;
    for (const q of makeVariants(p.question, count)) if (candidates.length < count) accept(q, `'${p.question}'와 같은 형태로 숫자만 바꾼 문항이에요.`, "rule");
  }
  if (!candidates.length) throw new Error("보충 문항을 만들지 못했어요. 직접 입력해 주세요.");
  return candidates.slice(0, count);
}

// 문장제 검산: 문제만 보고 처음부터 다시 풀어 답이 같은 것만 남긴다 (검산이 안 되면 문장제는 쓰지 않는다)
async function verifyWordProblems<T extends { question: string; answer: string }>(items: T[], grade?: number | null): Promise<T[]> {
  if (!items.length) return [];
  const system = `너는 ${gradeName(grade ?? 1)} 수학 문제를 처음 보는 학생처럼 직접 푸는 검산 도우미다.
- 각 문제를 처음부터 식을 세워 계산하고, 구한 답을 문제 조건에 다시 대입해 확인한다.
- 조건이 맞지 않거나 답이 없거나 여러 개면 problem 에 이유를 쓴다 (문제없으면 빈 문자열).
- answer 에는 구한 값의 숫자만 쓴다.
- JSON만 출력: {"results": [{"no": 1, "answer": "...", "problem": ""}]}`;
  try {
    const parsed = JSON.parse(
      (await chat(system, items.map((it, i) => `${i + 1}. ${it.question}`).join("\n"), 0)).match(/\{[\s\S]*\}/)?.[0] ?? "{}",
    ) as { results?: { no?: unknown; answer?: unknown; problem?: unknown }[] };
    const ok = new Set<number>();
    for (const r of parsed.results ?? []) {
      const i = Number(r.no) - 1;
      if (items[i] && !String(r.problem ?? "").trim() && sameNumbers(items[i].answer, String(r.answer ?? "")) === true) ok.add(i);
    }
    return items.filter((_, i) => ok.has(i));
  } catch {
    return [];
  }
}

// 개인 보충: 학생의 오답(문항별 최신 풀이)을 근거로 보충 문항 후보를 만든다
export async function draftSupplement(studentId: string, count = 3): Promise<SupplementDraft> {
  const [subs, problems, summary, profile, grade] = await Promise.all([
    listSubmissions({ studentId }),
    problemIndex(),
    getSummary(studentId),
    getProfile(studentId),
    getStudentGrade(studentId).catch(() => null),
  ]);
  const wrong = wrongOf(studentId, subs, problems);
  if (!wrong.length && !summary.summary?.weakConcepts.length) throw new Error("보충할 오답이 아직 없어요. 풀이가 분석된 뒤 다시 시도해 주세요.");
  const adapt = toAdapt(profile);

  // 가장 많이 나온 오류 유형 (이미 극복한 오류는 다른 오류가 있으면 건너뜀) → 그 오류가 나온 풀이를 근거로
  const targetError = mostCommonError(wrong, adapt.overcome);
  const basisSubs = (targetError ? wrong.filter((s) => errorOf(s) === targetError) : wrong).slice(-3);
  const concept =
    summary.summary?.weakConcepts[0]?.concept ||
    basisSubs[0]?.analysis?.concept ||
    problems.get(basisSubs[0]?.problemId ?? "")?.concept ||
    "일차방정식";
  const basis = describeBasis(basisSubs, problems);
  // 틀린 단계가 인수분해처럼 일차방정식이 아닌 개념이면 그 개념 위주로
  const step = stepConcept(basisSubs, problems);
  if (needsConceptPath(step, basisSubs, problems)) {
    const candidates = await conceptCandidates(grade ?? 1, step!, basis, problems, count);
    return { concept: step!, targetError, sourceSubmissionIds: basisSubs.map((s) => s.id), basis, candidates, adapted: describeAdapt(profile), profile };
  }
  const candidates = await fillCandidates({
    grade,
    concept,
    targetError,
    basisSubs,
    basis,
    problems,
    count,
    practice: summary.summary?.practice,
    adapt,
  });
  const adapted = describeAdapt(profile);
  return { concept, targetError, sourceSubmissionIds: basisSubs.map((s) => s.id), basis, candidates, adapted, profile };
}

// 소그룹 보충: 같은 약점을 가진 학생들의 오답을 근거로, 그룹 전체에 낼 문항 후보를 만든다
export async function draftGroupSupplement(
  studentIds: string[],
  weak: { targetError: ErrorType | null; concept: string | null },
  count = 4,
): Promise<SupplementDraft> {
  const [problems, subsList, profiles, grade] = await Promise.all([
    problemIndex(),
    Promise.all(studentIds.map((id) => listSubmissions({ studentId: id }))),
    Promise.all(studentIds.map((id) => getProfile(id))),
    getStudentGrade(studentIds[0] ?? "").catch(() => null),
  ]);
  // 그룹 전원이 이미 된 것만 덜 낸다
  const shared = intersectProfiles(profiles);
  // 학생마다 그 약점이 나온 최근 오답 2개씩
  const basisSubs = studentIds.flatMap((id, i) => {
    const wrong = wrongOf(id, subsList[i], problems);
    const matched = wrong.filter((s) =>
      weak.targetError ? errorOf(s) === weak.targetError : !weak.concept || (s.analysis?.concept || problems.get(s.problemId)?.concept) === weak.concept,
    );
    return matched.slice(-2);
  });
  const targetError = weak.targetError ?? mostCommonError(basisSubs);
  // 개념: 근거 풀이에서 가장 많이 나온 개념
  const conceptCounts = new Map<string, number>();
  for (const s of basisSubs) {
    const c = s.analysis?.concept || problems.get(s.problemId)?.concept;
    if (c) conceptCounts.set(c, (conceptCounts.get(c) ?? 0) + 1);
  }
  const concept = weak.concept || [...conceptCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || "일차방정식";
  const basis = describeBasis(basisSubs.slice(-4), problems); // AI 입력·화면 표시는 최근 4개만 (학생 이름은 넣지 않음)
  const step = stepConcept(basisSubs, problems);
  if (needsConceptPath(step, basisSubs, problems)) {
    const candidates = await conceptCandidates(grade ?? 1, step!, basis, problems, count);
    return { concept: step!, targetError, sourceSubmissionIds: basisSubs.map((s) => s.id), basis, candidates, adapted: describeAdapt(shared, "그룹 학생 모두가") };
  }
  const candidates = await fillCandidates({ concept, targetError, basisSubs, basis, problems, count, adapt: toAdapt(shared), grade });
  const adapted = describeAdapt(shared, "그룹 학생 모두가");
  return { concept, targetError, sourceSubmissionIds: basisSubs.map((s) => s.id), basis, candidates, adapted };
}

// ── 학생별 보충 기록 (전후 비교) ──
export type SupplementProgress = {
  id: string;
  title: string;
  status: ReturnType<typeof statusOf>;
  dueAt?: number;
  createdAt: number;
  concept: string;
  targetError: ErrorType | null;
  group?: { name: string; size: number }; // 소그룹 보충이면 그룹 이름·인원
  before: { count: number; wrong: number; targetErrors: number; items: string[] };
  after: { total: number; submitted: number; judged: number; correct: number; targetErrors: number; review: number };
  review?: SupplementReview;
};

// 보충 전 근거 풀이 id (예전에 검사 없이 저장된 값이 배열이 아니어도 깨지지 않게)
const sourceIds = (sup: { sourceSubmissionIds?: unknown }) =>
  Array.isArray(sup.sourceSubmissionIds) ? sup.sourceSubmissionIds.filter((x): x is string => typeof x === "string") : [];

// 이 학생이 보충 문항을 푼 결과 (문항별 최신)
function afterOf(a: Assignment, subs: Submission[], studentId: string) {
  const latest = new Map<string, Submission>();
  for (const s of subs.filter((x) => x.studentId === studentId).sort((x, y) => x.submittedAt - y.submittedAt))
    if (a.problems.some((p) => p.id === s.problemId)) latest.set(s.problemId, s);
  return [...latest.values()];
}

export async function supplementProgress(studentId: string): Promise<SupplementProgress[]> {
  const [assignments, subs, problems] = await Promise.all([listAssignments(), listSubmissions({ studentId }), problemIndex()]);
  const byId = new Map(subs.map((s) => [s.id, s]));
  return assignments
    .filter((a) => supplementStudents(a.supplement).includes(studentId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => {
      const sup = a.supplement!;
      // 그룹 보충이면 근거 풀이 중 이 학생 것만
      const before = sourceIds(sup).map((id) => byId.get(id)).filter((s): s is Submission => !!s);
      const after = afterOf(a, subs, studentId);
      const judged = after.filter((s) => correctOf(s) !== null);
      return {
        id: a.id,
        title: a.title,
        status: statusOf(a),
        dueAt: a.dueAt,
        createdAt: a.createdAt,
        concept: sup.concept,
        targetError: sup.targetError,
        ...(sup.studentIds?.length ? { group: { name: sup.group ?? sup.concept, size: sup.studentIds.length } } : {}),
        before: {
          count: before.length,
          wrong: before.filter((s) => correctOf(s) === false).length,
          targetErrors: before.filter((s) => sup.targetError && errorOf(s) === sup.targetError).length,
          items: before.map((s) => problems.get(s.problemId)?.question ?? s.question ?? ""),
        },
        after: {
          total: a.problems.length,
          submitted: after.length,
          judged: judged.length,
          correct: judged.filter((s) => correctOf(s)).length,
          targetErrors: after.filter((s) => sup.targetError && errorOf(s) === sup.targetError).length,
          review: after.filter((s) => s.status === "needs_review" || s.status === "error").length,
        },
        review: supplementReviewOf(sup, studentId),
      };
    });
}

// ── AI 변화 분석: 보충 전 오답 vs 보충 후 풀이 (학생 한 명 기준, 그룹 보충이면 학생마다 따로) ──
export async function reviewSupplement(assignmentId: string, studentId?: string): Promise<SupplementReview> {
  const a = await getAssignment(assignmentId);
  if (!a?.supplement) throw new Error("보충 과제가 아니에요.");
  const targets = supplementStudents(a.supplement);
  const sid = studentId ?? targets[0];
  if (!sid || !targets.includes(sid)) throw new Error("이 보충 과제를 받은 학생이 아니에요.");
  const [subs, problems, grade] = await Promise.all([listSubmissions({ studentId: sid }), problemIndex(), getStudentGrade(sid).catch(() => null)]);
  const byId = new Map(subs.map((s) => [s.id, s]));
  const after = afterOf(a, subs, sid);
  if (!after.length) throw new Error("학생이 아직 보충 문항을 풀지 않았어요.");
  const sup = a.supplement;

  const line = (s: Submission) => {
    const p = problems.get(s.problemId);
    const lines = (s.analysis?.correctedLines?.length ? s.analysis.correctedLines : s.ocrLines).join(" → ") || "(인식 실패)";
    const ok = correctOf(s);
    const verdict = !s.analysis && !s.teacher?.confirmedAt ? "분석 실패" : ok === null ? "판정 보류" : ok ? "정답" : "오답";
    const e = errorOf(s);
    const unreadable = s.status === "needs_review" || s.status === "error" ? " ⚠판독 어려움" : "";
    return `- ${p?.question ?? s.question}: ${lines} [${verdict}${e ? `, ${ERROR_LABEL[e]}` : ""}${unreadable}]${s.teacher?.memo ? ` 교사 메모: ${s.teacher.memo}` : ""}`;
  };

  const system = `너는 ${grade ? gradeName(grade) : "중·고등학교"} 수학 교사를 돕는 도우미다. 보충 지도 전의 오답과 보충 문항 풀이를 비교해서 같은 오류가 사라졌는지 판단한다.
규칙:
- 기록에 있는 풀이만 근거로, 식을 직접 인용한다.
- 판독 어려움(⚠) 표시 풀이는 판단에서 빼고, 판단할 근거가 부족하면 verdict 를 "판단 보류"로 한다.
- verdict: 목표 오류가 보충 풀이에서 다시 나오지 않고 대부분 맞혔으면 "개선", 일부만 나아졌으면 "부분 개선", 같은 오류가 다시 나오면 "아직 반복".
- 교사에게 존댓말(~요)로, 학생은 '학생'이라고 부른다. JSON만 출력.`;
  const user = `[보충 개념] ${sup.concept} / [목표 오류] ${sup.targetError ? ERROR_LABEL[sup.targetError] : "특정되지 않음"}
[보충 전 풀이]
${sourceIds(sup).map((id) => byId.get(id)).filter((s): s is Submission => !!s).map(line).join("\n") || "(기록 없음)"}
[보충 문항 풀이 (문항별 최신)]
${after.map(line).join("\n")}
(보충 문항 ${a.problems.length}개 중 ${after.length}개 제출)

JSON: {"verdict": "개선|부분 개선|아직 반복|판단 보류", "summary": "2문장 이내", "remaining": ["아직 남은 어려움 (없으면 빈 배열)"], "nextStep": "다음 지도 제안 한 문장"}`;

  const text = await chat(system, user, 0.2);
  const p = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Partial<SupplementReview>;
  const verdicts: SupplementReview["verdict"][] = ["개선", "부분 개선", "아직 반복", "판단 보류"];
  const review: SupplementReview = {
    generatedAt: Date.now(),
    model: env("ANALYSIS_MODEL") ?? "solar-pro4",
    verdict: verdicts.includes(p.verdict as SupplementReview["verdict"]) ? (p.verdict as SupplementReview["verdict"]) : "판단 보류",
    summary: String(p.summary ?? ""),
    remaining: Array.isArray(p.remaining) ? p.remaining.map(String).slice(0, 3) : [],
    nextStep: String(p.nextStep ?? ""),
  };
  await setSupplementReview(assignmentId, sid, review);
  return review;
}

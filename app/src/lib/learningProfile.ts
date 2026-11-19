import { listAssignments } from "./assignments";
import { conceptWords, listTemplates, type Template } from "./problemBank";
import { DEFAULT_SETTINGS } from "./classSettings";
import { studentSettings } from "./settings";
import { listSubmissions } from "./store";
import { ERROR_LABEL, type ErrorType, type Submission } from "./types";

// 학습 프로필: 학생이 지금까지 푼 기록에서 '이미 된 것'을 찾아 다음 문제 선택에 다시 반영한다
//  - 극복한 오류: 마지막으로 그 오류가 나온 뒤, 그 오류를 연습하는 문항을 연속 MASTERY 개 이상 맞힘
//  - 익힌 틀: 문제은행 틀에서 나온 문항을 최근 MASTERY 번 연속 맞힘 → 같은 틀은 뒤로, 한 단계 어려운 틀부터
//  - 잘하는 개념: 문항별 최신 풀이가 STRONG_MIN 개 이상 판정됐고 정답률 STRONG_RATE 이상
// 문항이 어떤 오류를 '연습하는지'는 문제은행 틀의 targets, 아니면 보충 과제의 목표 오류로 안다
// MASTERY 는 반마다 교사가 정한다 (교사 설정, 기본 4번: 한두 번 맞힌 것은 우연일 수 있어서)
export const MASTERY = DEFAULT_SETTINGS.mastery;
const STRONG_MIN = 3;
const STRONG_RATE = 0.8;

const NOT_AN_ERROR: ErrorType[] = ["NONE", "UNREADABLE"];
const errorOf = (s: Submission): ErrorType | null => {
  const e = s.teacher?.errorType ?? s.analysis?.errorType ?? null;
  return e && !NOT_AN_ERROR.includes(e) ? e : null;
};

export type LearningProfile = {
  overcome: { error: ErrorType; streak: number }[]; // 극복한 오류 (연속 정답 수)
  active: ErrorType[]; // 아직 남은 오류 (최근 것부터)
  mastered: { templateId: string; pattern: string; streak: number }[]; // 익힌 문제 틀
  strong: { concept: string; correct: number; judged: number }[]; // 잘하는 개념
};

type ProblemInfo = { concept?: string; templateId?: string; practices: ErrorType[] };

// 문항 → (개념, 틀, 연습시키는 오류)
async function problemInfo(templates: Template[]) {
  const byTemplate = new Map(templates.map((t) => [t.id, t]));
  const map = new Map<string, ProblemInfo>();
  const diagnostic = new Set<string>(); // 예전 입학 레벨 테스트 문항 (기능은 뺐지만 DB 에 남은 것: 프로필에서 뺀다)
  for (const a of await listAssignments())
    for (const p of a.problems) {
      if (a.kind === "diagnostic") {
        diagnostic.add(p.id);
        continue;
      }
      const t = p.templateId ? byTemplate.get(p.templateId) : undefined;
      const practices = new Set<ErrorType>(t?.targets ?? []);
      if (a.supplement?.targetError) practices.add(a.supplement.targetError);
      map.set(p.id, { concept: p.concept, templateId: p.templateId, practices: [...practices] });
    }
  return { map, diagnostic };
}

export function buildProfile(subs: Submission[], problems: Map<string, ProblemInfo>, templates: Template[], mastery = MASTERY): LearningProfile {
  const judged = subs
    .filter((s) => typeof s.analysis?.correct === "boolean")
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const ok = (s: Submission) => s.analysis!.correct === true && !errorOf(s);

  // ── 오류별: 마지막으로 나온 뒤 그 오류를 연습하는 문항의 연속 정답 ──
  const seenErrors = [...new Set(judged.map(errorOf).filter((e): e is ErrorType => !!e))];
  const overcome: LearningProfile["overcome"] = [];
  const active: { error: ErrorType; at: number }[] = [];
  for (const e of seenErrors) {
    const lastIdx = judged.findLastIndex((s) => errorOf(s) === e);
    let streak = 0;
    for (const s of judged.slice(lastIdx + 1)) {
      if (!problems.get(s.problemId)?.practices.includes(e)) continue;
      if (ok(s)) streak++;
      else break; // 다른 오류로 틀려도 연속은 끊는다
    }
    if (streak >= mastery) overcome.push({ error: e, streak });
    else active.push({ error: e, at: judged[lastIdx].submittedAt });
  }

  // ── 틀별: 최근 연속 정답 ──
  const byTemplate = new Map<string, Submission[]>();
  for (const s of judged) {
    const tid = problems.get(s.problemId)?.templateId;
    if (tid) byTemplate.set(tid, [...(byTemplate.get(tid) ?? []), s]);
  }
  const patternOf = new Map(templates.map((t) => [t.id, t.pattern]));
  const mastered: LearningProfile["mastered"] = [];
  for (const [templateId, list] of byTemplate) {
    let streak = 0;
    for (let i = list.length - 1; i >= 0 && ok(list[i]); i--) streak++;
    if (streak >= mastery) mastered.push({ templateId, pattern: patternOf.get(templateId) ?? templateId, streak });
  }

  // ── 개념별: 문항마다 최신 풀이 기준 정답률 ──
  const latest = new Map<string, Submission>();
  for (const s of judged) latest.set(s.problemId, s);
  const concepts = new Map<string, { correct: number; judged: number }>();
  for (const s of latest.values()) {
    const c = s.analysis?.concept || problems.get(s.problemId)?.concept;
    if (!c) continue;
    const v = concepts.get(c) ?? { correct: 0, judged: 0 };
    v.judged++;
    v.correct += s.analysis!.correct ? 1 : 0;
    concepts.set(c, v);
  }
  const strong = [...concepts]
    .filter(([, v]) => v.judged >= STRONG_MIN && v.correct / v.judged >= STRONG_RATE)
    .map(([concept, v]) => ({ concept, ...v }));

  return {
    overcome: overcome.sort((a, b) => b.streak - a.streak),
    active: active.sort((a, b) => b.at - a.at).map((a) => a.error),
    mastered: mastered.sort((a, b) => b.streak - a.streak),
    strong: strong.sort((a, b) => b.correct / b.judged - a.correct / a.judged || b.judged - a.judged),
  };
}

// mastery 를 주지 않으면 학생이 지금 속한 반의 교사 설정
export async function getProfile(studentId: string, opts: { mastery?: number } = {}): Promise<LearningProfile> {
  const templates = await listTemplates({ activeOnly: false }).catch(() => [] as Template[]);
  const [subs, { map, diagnostic }, settings] = await Promise.all([listSubmissions({ studentId }), problemInfo(templates), opts.mastery ? Promise.resolve({ mastery: opts.mastery }) : studentSettings(studentId)]);
  return buildProfile(
    subs.filter((s) => !diagnostic.has(s.problemId)),
    map,
    templates,
    settings.mastery,
  );
}

// 소그룹: 모든 학생에게 해당하는 것만 남긴다 (한 명이라도 아직이면 덜 내지 않음)
export function intersectProfiles(profiles: LearningProfile[]): LearningProfile {
  if (!profiles.length) return { overcome: [], active: [], mastered: [], strong: [] };
  const all = <T,>(pick: (p: LearningProfile) => T[], keyOf: (x: T) => string) => {
    const [first, ...rest] = profiles;
    return pick(first).filter((x) => rest.every((p) => pick(p).some((y) => keyOf(y) === keyOf(x))));
  };
  return {
    overcome: all((p) => p.overcome, (x) => x.error),
    active: [...new Set(profiles.flatMap((p) => p.active))],
    mastered: all((p) => p.mastered, (x) => x.templateId),
    strong: all((p) => p.strong, (x) => x.concept),
  };
}

// 문제 선택에 반영할 형태
export type Adapt = {
  overcome: Set<ErrorType>;
  mastered: Set<string>; // templateId
  strongWords: Set<string>; // 잘하는 개념의 낱말 (틀 개념과 맞춰 보기)
};
export function toAdapt(p: LearningProfile): Adapt {
  return {
    overcome: new Set(p.overcome.map((o) => o.error)),
    mastered: new Set(p.mastered.map((m) => m.templateId)),
    strongWords: new Set(p.strong.flatMap((s) => conceptWords(s.concept))),
  };
}

// 교사에게 보여 줄 '이번 선택에 반영한 기록'
export function describeAdapt(p: LearningProfile, subject = "학생이"): string[] {
  const notes: string[] = [];
  for (const o of p.overcome) notes.push(`${ERROR_LABEL[o.error]} 오류는 그 뒤 연습 문항을 ${o.streak}번 연속 맞혀서 덜 냈어요.`);
  if (p.mastered.length)
    notes.push(`${p.mastered.map((m) => `'${m.pattern}'`).join(", ")} 틀은 이미 연속으로 맞혀서 뒤로 미루고 한 단계 어려운 틀부터 냈어요.`);
  if (p.strong.length)
    notes.push(`${subject} 잘하는 개념(${p.strong.map((s) => `${s.concept} ${s.correct}/${s.judged}`).join(", ")})은 덜 냈어요.`);
  return notes;
}

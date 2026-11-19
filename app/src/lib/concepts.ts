import { CURRICULUM, gradeLabel } from "./curriculum";

// 전 학년 개념 목록 = curriculum.ts 의 모든 소단원 (중1 ~ 고2, 학년이 늘면 curriculum.ts 에 단원만 넣으면 된다)
// 채점 AI 가 '처음 틀린 줄에서 하던 일'이 이 목록의 어느 소단원인지 고른다 (Analysis.errorLessonId).
// 고른 소단원의 학년이 학생 학년보다 낮으면 '이전 학년 기초가 비어 있음' (예: 고2 접선 문항인데 판별식을 틀림 → 고1 이차방정식).
// 학년마다 '어느 학년 개념으로 이어지는지' 연결표를 따로 만들 필요가 없다. 화면·서버 둘 다 쓴다. DB 를 import 하지 않는다
export type ConceptLesson = { id: string; grade: number; unit: string; name: string; desc: string };

export const ALL_LESSONS: ConceptLesson[] = Object.entries(CURRICULUM)
  .sort(([a], [b]) => Number(a) - Number(b))
  .flatMap(([g, units]) => units.flatMap((u) => u.lessons.map((l) => ({ id: l.id, grade: Number(g), unit: u.name, name: l.name, desc: l.desc }))));

const BY_ID = new Map(ALL_LESSONS.map((l) => [l.id, l]));

export const lessonOf = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);

// '고1 · 방정식과 부등식 · 이차방정식'
export const conceptLabel = (l: ConceptLesson) => `${gradeLabel(l.grade)} · ${l.unit} · ${l.name}`;

// 학생 학년까지의 소단원 (학년을 모르면 전부). 중2 풀이에 고2 개념이 붙지 않게
export const lessonsUpTo = (grade?: number | null) => (grade ? ALL_LESSONS.filter((l) => l.grade <= grade) : ALL_LESSONS);

// 채점 프롬프트에 넣는 목록. desc 까지 넣는다: 같은 이름(중3·고1 '이차방정식')을 학습 내용(근의 공식 / 판별식)으로 가르게
export const conceptListText = (grade?: number | null) =>
  lessonsUpTo(grade)
    .map((l) => `${l.id} ${gradeLabel(l.grade)} ${l.unit} > ${l.name}: ${l.desc}`)
    .join("\n");

// AI 가 고른 소단원 확인. AI 는 '1-2-3 정수와 유리수의 곱셈·나눗셈' 처럼 id 와 이름을 같이 쓴다.
//  긴 목록에서 id 를 잘못 옮겨 적는 일이 있어서 (틀린 단계는 '음수 거듭제곱'이라고 맞게 쓰고 id 는 고2 삼각함수) 이름으로 확인한다:
//  id 와 이름이 맞으면 그 id, 안 맞으면 이름이 같은 소단원 (학생 학년까지, 낮은 학년 먼저), 그래도 없으면 버린다 (틀린 연결보다 없는 게 낫다).
//  '맞음'은 넉넉히 본다: AI 가 '단원 > 소단원' 이나 학습 내용 앞부분('로그의 뜻과 성질')을 이름 자리에 쓰기도 한다.
//  이름 없이 id 만 왔으면 id 만 확인
export function asLessonId(v: unknown, grade?: number | null): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+-\d+-\d+)\s*[:·.)\-]?\s*(.*)$/);
  const allowed = (id: string | undefined) => {
    const l = id ? BY_ID.get(id) : undefined;
    return l && (!grade || l.grade <= grade) ? l : undefined;
  };
  const byId = allowed(m?.[1] ?? v.trim());
  const name = (m?.[2] ?? "").trim();
  if (!name) return byId?.id ?? null;
  const last = name.split(">").pop()!.trim(); // '단원 > 소단원' 이면 소단원
  const agrees = (l: ConceptLesson) => l.name === last || name.includes(l.name) || l.desc.startsWith(last) || last === l.unit;
  if (byId && agrees(byId)) return byId.id;
  return lessonsUpTo(grade).find((l) => l.name === last)?.id ?? null;
}

// 개념이 어느 학교 과정인지 (학생 상세 '개념별 이해도'를 중등·고등으로 나눠 보여 줄 때)
//  1) 교육과정 소단원·단원 이름과 맞으면 그 학년 (중3·고1 '이차방정식'처럼 양쪽에 다 있으면 반 학년으로)
//  2) 못 찾으면 과정이 분명한 말(항등식 → 고등, 이항 → 중등), 그래도 없으면 반 학년 (중1~중3 → 중등, 고1~ → 고등)
export type SchoolStage = "중등" | "고등";
export const SCHOOL_STAGES: SchoolStage[] = ["중등", "고등"];
// 교육과정 소단원 이름과 딱 맞지 않아도 학교 과정이 분명한 말 (AI 가 개념 이름을 조금씩 다르게 쓴다)
const HIGH = /항등식|미정계수|나머지정리|인수정리|복소수|다항식의\s*연산/;
const MIDDLE = /이항|동류항|분배법칙|정수|유리수|등식의\s*성질|일차방정식|일차식/;
const stageOfGrade = (g: number): SchoolStage => (g >= 4 ? "고등" : "중등");
const NAMES = [...new Set(ALL_LESSONS.flatMap((l) => [l.name, l.unit]))].sort((a, b) => b.length - a.length); // 긴 이름 먼저

export function schoolStageOf(concept: string, grade?: number | null): SchoolStage {
  const fallback = grade ? stageOfGrade(grade) : "중등";
  const c = concept.replace(/\s/g, "");
  const hit = NAMES.find((n) => n.length >= 2 && c.includes(n.replace(/\s/g, "")));
  if (!hit) return HIGH.test(concept) ? "고등" : MIDDLE.test(concept) ? "중등" : fallback;
  const stages = new Set(ALL_LESSONS.filter((l) => l.name === hit || l.unit === hit).map((l) => stageOfGrade(l.grade)));
  return stages.size === 1 ? [...stages][0] : fallback;
}

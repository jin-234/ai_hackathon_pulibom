import { chat, ERROR_GUIDE, SURVEY_RESPONDENTS, TEACHER_PICKS } from "./ai";
import { listAssignments } from "./assignments";
import { statsForStudent } from "./classStats";
import { getStudent } from "./roster";
import { PROBLEMS } from "./problems";
import { listSubmissions } from "./store";
import { ERROR_LABEL, handwritingIssue, hasHandwritingIssue, inkStats, type ErrorType, type Problem, type StudentSummary, type Submission, type WeakProof } from "./types";
import { env } from "./env";
import { query } from "./db";

// 학생별 AI 학습 요약 (Solar Pro 4, 나중에 다른 모델로 교체 가능)
// 학생 이름 등 식별정보는 보내지 않는다.
const MAX_SUBMISSIONS = 30;
// 요약 프롬프트를 바꾸면 올린다 (예전 프롬프트로 만든 요약은 '새로 요약 필요'로 보이게)
const PROMPT_VERSION = "10";
// AI 에 넘기는 실수 유형 이름: 교사 설문에 있는 유형은 그 이름으로 (요약이 같은 이름으로 부르게)
const typeName = (t: ErrorType) => TEACHER_PICKS.find((p) => p.type === t)?.name ?? ERROR_LABEL[t];

async function context(studentId: string) {
  const [assignments, all] = await Promise.all([listAssignments(), listSubmissions({ studentId })]);
  const problems = new Map<string, Problem>();
  for (const a of assignments) for (const p of a.problems) problems.set(p.id, p);
  for (const p of PROBLEMS) if (!problems.has(p.id)) problems.set(p.id, p);
  const mine = all.filter((s) => s.studentId === studentId && s.status !== "pending").sort((a, b) => a.submittedAt - b.submittedAt);
  const subs = mine.filter((s) => problems.has(s.problemId)).slice(-MAX_SUBMISSIONS);
  // 풀이가 추가·재분석·교사 확인되면 바뀌는 값
  const fingerprint = `p${PROMPT_VERSION}#` + subs.map((s) => `${s.id}:${s.status}:${s.teacher?.confirmedAt ?? 0}`).join("|");
  return { problems, subs, fingerprint };
}

export async function getSummary(studentId: string): Promise<{ summary: StudentSummary | null; stale: boolean; available: number }> {
  if (!/^[\w-]+$/.test(studentId)) return { summary: null, stale: false, available: 0 };
  const { subs, fingerprint } = await context(studentId);
  const available = subs.length;
  try {
    const rows = await query<{ data: StudentSummary }>(`SELECT data FROM student_summaries WHERE student_id = $1`, [studentId]);
    const summary = rows[0]?.data ?? null;
    return { summary, stale: !!summary && summary.fingerprint !== fingerprint, available };
  } catch {
    return { summary: null, stale: false, available };
  }
}

const linesOf = (s: Submission) => (s.analysis?.correctedLines?.length ? s.analysis.correctedLines : s.ocrLines);

// 중간 과정 없이 답 한 줄만 쓴 풀이 (설문에서 12명이 '어디서 틀렸는지 확인하기 어렵다'고 꼽음). 수학 실수가 아니라 코드가 센다
const skippedSteps = (s: Submission) => linesOf(s).filter((l) => l.trim()).length === 1;

// 첫 오류 줄과 그 앞 줄 (채점 때 AI 가 짚은 줄. 없으면 null)
function wrongLineOf(s: Submission): { wrongLine: string; prevLine?: string } | null {
  const lines = linesOf(s);
  const i = s.analysis?.firstErrorLine;
  if (typeof i !== "number" || !lines[i]) return null;
  return { wrongLine: lines[i], ...(i > 0 && lines[i - 1] ? { prevLine: lines[i - 1] } : {}) };
}

function describe(s: Submission, p: Problem, attemptNo: number, no: number) {
  const a = s.analysis;
  const err = s.teacher?.errorType ?? a?.errorType;
  const lines = linesOf(s).join(" / ") || "(인식 실패)";
  const st = inkStats(s);
  const wrong = a?.correct === false ? wrongLineOf(s) : null;
  return [
    `- [풀이 ${no}] 문항: ${p.question} (정답 ${p.answer || "미입력"}, 개념 ${p.concept || "미지정"})${attemptNo > 1 ? ` · ${attemptNo}번째 풀이` : ""}`,
    `  풀이(인식): ${lines}`,
    wrong ? `  처음 틀린 줄: ${wrong.prevLine ? `${wrong.prevLine} → ` : ""}${wrong.wrongLine}` : "",
    `  AI 판정: ${a ? (a.correct === null ? "판정 보류" : a.correct ? "정답" : "오답") : "분석 실패"}${err ? ` · 오류 유형 ${typeName(err)}${s.teacher?.errorType ? "(교사 확인)" : ""}` : ""}`,
    // 교사가 오류 유형을 바꿨으면 AI 근거는 다른 유형 기준이라 참고로만
    a?.reason
      ? s.teacher?.errorType && s.teacher.errorType !== a.errorType
        ? `  AI 근거(참고만: AI 는 ${typeName(a.errorType)}로 봤지만 교사가 ${typeName(s.teacher.errorType)}로 고침, 교사 판단을 따른다): ${a.reason}`
        : `  근거: ${a.reason}`
      : "",
    s.status === "needs_review" || s.status === "error" ? `  ⚠ 판독이 어렵거나 근거가 부족한 풀이${s.teacher?.confirmedAt ? " (교사 확인함)" : ""}` : "",
    hasHandwritingIssue(s)
      ? `  ✎ 글씨체 문제: ${handwritingIssue(s).nothingRead ? "OCR 이 이 풀이를 하나도 읽지 못했다" : `OCR 이 이 풀이의 ${handwritingIssue(s).lines.length}줄을 이상하게 읽었다 (인식이 틀렸을 수 있다)`}`
      : "",
    skippedSteps(s) ? `  ⤳ 중간 과정 없이 답만 씀` : "",
    s.teacher?.memo ? `  교사 관찰 메모: ${s.teacher.memo}` : "",
    `  풀이 시간 ${st.durationSec}초, 지운 횟수 ${st.erases}회`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateSummary(studentId: string): Promise<StudentSummary> {
  const roster = await getStudent(studentId);
  if (!roster) throw new Error("학생을 찾을 수 없어요.");
  const { problems, subs, fingerprint } = await context(studentId);
  if (!subs.length) throw new Error("요약할 풀이가 아직 없어요.");
  // 풀이가 그대로면 저장된 요약을 그대로 돌려준다 (같은 기록인데 누를 때마다 결과가 바뀌지 않게)
  const saved = await query<{ data: StudentSummary }>(`SELECT data FROM student_summaries WHERE student_id = $1`, [studentId]).catch(() => []);
  if (saved[0]?.data?.fingerprint === fingerprint) return saved[0].data;

  const summary = await summarize({ studentId, name: roster.name, problems, subs, fingerprint });
  await query(
    `INSERT INTO student_summaries (student_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (student_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [studentId, JSON.stringify(summary)],
  );
  return summary;
}

// 글씨체 문제: OCR 이 이상하게 읽은 풀이가 2개 이상이거나 전체의 30% 이상이면 교사가 확인할 점으로 넣는다 (AI 가 아니라 코드가 정해 늘 같게)
function handwritingCaution(subs: Submission[], problems: Map<string, Problem>): string[] {
  const odd = subs.filter(hasHandwritingIssue);
  if (odd.length < 2 && odd.length / Math.max(subs.length, 1) < 0.3) return [];
  const ex = [...new Set(odd.map((s) => problems.get(s.problemId)?.question ?? s.question ?? ""))].filter(Boolean).slice(0, 2).join(", ");
  return [`글씨체 문제: 풀이 ${subs.length}개 중 ${odd.length}개를 OCR 이 제대로 읽지 못했어요${ex ? ` (예: ${ex})` : ""}. 원본 풀이를 확인하고, x·숫자·부호를 또박또박 쓰도록 지도해 주세요.`];
}

// 과정 생략: 답만 쓴 풀이가 2개 이상이거나 전체의 30% 이상이면 교사가 확인할 점으로 넣는다 (글씨체와 같은 기준, 코드가 정해 늘 같게)
function skippedStepsCaution(subs: Submission[], problems: Map<string, Problem>): string[] {
  const skipped = subs.filter(skippedSteps);
  if (skipped.length < 2 && skipped.length / Math.max(subs.length, 1) < 0.3) return [];
  const wrong = skipped.filter((s) => s.analysis?.correct === false).length;
  const ex = [...new Set(skipped.map((s) => problems.get(s.problemId)?.question ?? s.question ?? ""))].filter(Boolean).slice(0, 2).join(", ");
  return [
    `과정 생략: 풀이 ${subs.length}개 중 ${skipped.length}개를 중간 식 없이 답만 썼어요${ex ? ` (예: ${ex})` : ""}${wrong ? `. 그중 ${wrong}개는 틀렸는데 어디서 틀렸는지 알 수 없어요` : ""}. 암산하지 말고 중간 식을 한 줄씩 쓰도록 지도해 주세요.`,
  ];
}

// DB 없이 풀이 기록만으로 요약 (프롬프트 테스트: scripts/test-weakness.ts 에서도 쓴다)
export async function summarize(input: {
  studentId: string;
  name: string;
  problems: Map<string, Problem>;
  subs: Submission[];
  fingerprint: string;
}): Promise<StudentSummary> {
  const { studentId, problems, subs, fingerprint } = input;
  const stats = statsForStudent(studentId, input.name, [...new Set(subs.map((s) => s.problemId))].map((id) => problems.get(id)!), subs);
  const attempt = new Map<string, number>();
  const records = subs
    .map((s) => {
      const n = (attempt.get(s.problemId) ?? 0) + 1;
      attempt.set(s.problemId, n);
      return describe(s, problems.get(s.problemId)!, n, subs.indexOf(s) + 1);
    })
    .join("\n");

  // 오류 유형 집계: 교사가 확인한 유형 우선, 판독이 어렵고 교사가 아직 확인하지 않은 풀이는 뺀다
  const tally = new Map<string, { n: number; problems: Set<string>; subs: Submission[] }>();
  for (const s of subs) {
    const err = s.teacher?.errorType ?? s.analysis?.errorType;
    if (!err || err === "NONE" || err === "UNREADABLE") continue;
    if ((s.status === "needs_review" || s.status === "error") && !s.teacher?.confirmedAt) continue;
    const t = tally.get(err) ?? { n: 0, problems: new Set<string>(), subs: [] };
    t.n++;
    t.subs.push(s);
    t.problems.add(s.problemId);
    tally.set(err, t);
  }
  // 횟수가 같으면 교사 설문에서 많이 꼽힌 유형을 먼저 (설문에 없는 유형은 뒤)
  const pickRank = (type: string) => {
    const i = TEACHER_PICKS.findIndex((p) => p.type === type);
    return i < 0 ? TEACHER_PICKS.length : i;
  };
  const byCount = (a: string, b: string) => tally.get(b)!.n - tally.get(a)!.n || pickRank(a) - pickRank(b);
  // 약점 정도: 서로 다른 문항 2개 이상이면 높음, 1개면 낮음. 그 실수를 낸 문항을 모두 다시 풀어 맞혔으면 한 단계 낮춘다
  const latest = new Map<string, Submission>();
  for (const s of subs) latest.set(s.problemId, s); // subs 는 오래된 순
  const priorityOf = (type: string): "높음" | "보통" | "낮음" => {
    const t = tally.get(type)!;
    const allFixed = [...t.problems].every((id) => latest.get(id)?.analysis?.correct === true && !latest.get(id)?.teacher?.errorType);
    if (t.problems.size >= 2) return allFixed ? "보통" : "높음";
    return "낮음";
  };
  // 다시 푼 문항: 같은 문항을 두 번 이상 낸 것 (없으면 다시 풀기 이야기를 아예 하지 않게)
  const retried = [...new Set(subs.filter((s, i) => subs.findIndex((x) => x.problemId === s.problemId) !== i).map((s) => s.problemId))];
  const retriedText = retried.length ? retried.map((id) => problems.get(id)?.question ?? id).join(", ") : "없음";
  const tallyText = tally.size
    ? [...tally.entries()]
        .sort((a, b) => byCount(a[0], b[0]))
        .map(([k, t]) => `${k}(${typeName(k as ErrorType)}) ${t.n}회, 서로 다른 문항 ${t.problems.size}개 [풀이 ${t.subs.map((s) => subs.indexOf(s) + 1).join(", ")}]`)
        .join(", ")
    : "없음";

  // 약점 근거: AI 가 고른 풀이 번호 중 실제로 그 유형인 풀이만 쓴다. 없거나 틀리면 집계의 풀이로 (최대 3개, 서로 다른 문항 먼저)
  const proofsOf = (type: string, picked: unknown): WeakProof[] => {
    const own = tally.get(type)!.subs;
    const chosen = (Array.isArray(picked) ? picked : [])
      .map((n) => subs[Number(n) - 1])
      .filter((s, i, all): s is Submission => !!s && own.includes(s) && all.indexOf(s) === i);
    const rest = own.filter((s) => !chosen.includes(s));
    const ordered = [...chosen, ...rest.filter((s, i) => rest.findIndex((x) => x.problemId === s.problemId) === i), ...rest];
    const seen = new Set<string>();
    return ordered
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .slice(0, 3)
      .map((s) => {
        const w = wrongLineOf(s);
        return {
          submissionId: s.id,
          question: problems.get(s.problemId)?.question ?? s.question ?? "",
          wrongLine: w?.wrongLine ?? linesOf(s).at(-1) ?? "",
          ...(w?.prevLine ? { prevLine: w.prevLine } : {}),
          reason: s.teacher?.memo || s.analysis?.reason || "",
          teacherChecked: !!s.teacher?.errorType,
        };
      });
  };

  const system = `너는 중학교 1학년 수학 교사를 돕는 학습 분석 도우미다. 교사가 풀이를 하나하나 볼 수 없으니, AI 가 문항마다 채점하고 분류해 둔 결과를 모아 이 학생이 무엇에 약한지 정리한다.
다음 순서대로 생각한다:
1단계: 풀이 기록에서 틀린 풀이마다 어디서 어떤 실수를 했는지 확인한다 (AI 판정의 오류 유형과 근거, 교사 확인이 있으면 그것을 따른다).
2단계: 같은 종류의 실수끼리 묶는다. [오류 유형 집계]를 기준으로 하되, 기록을 보고 실제로 같은 실수인지 확인한다.
3단계: 서로 다른 문항에서 되풀이된 실수를 이 학생의 약점으로 본다. "음수 계산에서 부호를 자주 틀려요", "이항할 때 부호를 바꾸지 않아요"처럼 교사가 한눈에 알 수 있는 말로 쓴다.
4단계: 약점마다 근거가 되는 식을 인용하고, 교사가 확인할 질문과 보충 연습 방향을 정한다.

[교사들이 많이 꼽은 실수 유형] 수학을 가르쳐 본 ${SURVEY_RESPONDENTS}명에게 학생 풀이에서 실제로 본 실수를 물은 설문에서 많이 고른 순서다. 학생의 실수가 여기에 해당하면 이 이름으로 부른다.
${TEACHER_PICKS.map((p) => `- ${p.type} "${p.name}" (${SURVEY_RESPONDENTS}명 중 ${p.picked}명): ${ERROR_GUIDE[p.type]}`).join("\n")}

규칙:
- overview 첫 문장에 이 학생의 가장 큰 약점(실수 유형)을 바로 쓴다. 뚜렷한 약점이 없으면 그렇다고 쓴다.
- 약점이라고 부르는 것은 서로 다른 문항 2개 이상에서 같은 유형의 실수가 나온 경우뿐이다. 실수가 유형마다 한 번씩이면 "반복", "약점", "부주의" 같은 말을 쓰지 말고 "한 번씩 실수가 있었어요. 반복되는지 지켜볼 필요가 있어요"처럼 쓴다.
${
    retried.length
      ? `- [다시 푼 문항]에 있는 문항을 처음엔 틀렸다가 다시 풀어 맞혔으면, overview 첫 문장 하나에 약점과 그 변화를 함께 쓴다 (예: "처음엔 이항할 때 부호를 바꾸지 않는 실수가 있었는데, 다시 풀 때는 바르게 고쳤어요"). 다시 풀어 고친 실수는 지금도 남은 약점처럼 단정하지 말고, 다른 문항에서도 고쳐졌는지 확인이 필요하다고 쓴다.
- '다시 풀기'는 [다시 푼 문항]에 있는 같은 문항을 또 낸 것만 뜻한다. 다른 문항을 맞힌 것은 다시 풀기나 '변화'가 아니다.`
      : `- 이 학생은 다시 푼 문항이 없다. '다시 풀기', '고친 기록', '변화' 이야기를 쓰지 않는다.`
  }
- 실수가 하나도 없으면 실수·반복 이야기를 쓰지 않고, 잘한 점과 다음에 도전해 볼 만한 문항을 쓴다. 기록에 없는 실수를 "나올 수 있다"고 짐작해서 쓰지 않는다.
- weakConcepts 는 [오류 유형 집계]에 있는 유형만, 유형 하나에 항목 하나씩 쓰고 type 에 그 코드를 쓴다. 집계에 없는 유형은 넣지 않는다. 같은 유형을 세부 내용으로 나누지 않는다 (세부 내용은 evidence 에).
- 교사가 오류 유형을 고친 풀이는 교사가 정한 유형으로 세고, evidence 도 교사 판단과 메모에 맞게 쓴다.
- 약점마다 근거가 되는 풀이 번호를 proofs 에 적는다. [오류 유형 집계]에서 그 유형 옆 [풀이 n] 에 있는 번호만 쓸 수 있다.
- evidence 는 proofs 에 적은 풀이의 '처음 틀린 줄'을 그대로 인용해서 무엇을 무엇으로 잘못 바꿨는지 쓴다 (예: "2x + 3 = 11 → 2x = 11 + 3 처럼 +3 을 옮기면서 부호를 바꾸지 않았어요"). 풀이에 없는 식을 만들어 쓰지 않는다.
- weakConcepts 의 concept 에는 실수 유형 이름을 쓴다. [교사들이 많이 꼽은 실수 유형]에 있는 코드면 그 이름을 그대로 쓴다 (예: "이항할 때 부호를 틀림", "괄호 앞 음수의 부호를 틀림"). 기록의 실수가 그 이름과 다르면 실제 실수에 맞게 고쳐 쓴다 (예: 곱셈을 틀렸으면 "곱셈 계산에서 틀림"). 목록에 없는 코드는 "동류항 정리", "계수 나누기"처럼 쓴다.
- overview 에서도 약점을 그 이름에 맞춰 부른다 (예: '조건을 놓치는 실수', '구하는 값을 혼동하는 실수', '이항할 때 부호를 바꾸지 않는 실수').
- 횟수가 같은 유형이 여럿이면 [오류 유형 집계]에 먼저 나온 유형을 먼저 쓴다.
- practice 는 그 실수가 다시 나올 수 있는 문항으로 쓴다 (예: 조건을 놓쳤으면 '양수', '자연수' 같은 조건이 붙은 문항, 구하는 값을 혼동했으면 x 가 아닌 값을 묻는 문장제, 괄호 앞 음수면 -( ) 가 있는 식, 대입이면 음수를 대입하는 식의 값).
- 주어진 기록에 있는 내용만 근거로 쓴다. 근거가 되는 식이나 문항을 직접 인용한다.
- 한두 번의 오답만으로 '개념 부족'을 단정하지 말고 "확인이 필요해 보인다"처럼 쓴다. 서로 다른 문항에서 반복된 오류를 더 중요하게 본다.
- 판독이 어렵다고 표시된 풀이는 판단 근거로 쓰지 말고 cautions 에 "원본 확인 필요"로 적는다.
- ✎ 글씨체 문제 표시는 수학 실수가 아니다. 약점(weakConcepts)으로 세지 않고, 글씨 이야기는 프로그램이 cautions 에 따로 넣으니 쓰지 않는다. 그 풀이의 식이 이상하면 인식 문제일 수 있으니 실수로 단정하지 않는다.
- ⤳ 중간 과정 없이 답만 씀 표시도 수학 실수가 아니다. 약점으로 세지 않고, 과정 생략 이야기는 프로그램이 cautions 에 따로 넣으니 쓰지 않는다. 답만 쓰고 틀린 풀이로 어떤 실수인지 짐작하지 않는다.
- COPY(옮겨 적기 실수)는 계산을 몰라서가 아니라 옮겨 적다 생긴 실수다. 개념 부족으로 쓰지 말고, practice 에는 문제를 옮겨 쓴 첫 줄과 마지막 답을 문제·앞 줄과 대조하는 습관을 쓴다.
- 교사 관찰 메모와 교사가 확인한 오류 유형을 AI 판정보다 우선한다.
- 풀이 시간이 길다는 것만으로 이해 부족이라고 판단하지 않는다.
- 다시 푼 문항이 있으면 처음과 비교해 달라진 점을 strengths 나 overview 에 쓴다.
- 학생을 부를 때는 '학생'이라고만 쓴다.
- '[풀이 n]' 번호는 proofs 에만 쓴다. 교사는 이 번호를 볼 수 없으니 overview·evidence·cautions 등 문장에는 번호 대신 문항 식을 쓴다.
- 모든 문장(overview, strengths, evidence, checkQuestions, practice, cautions)을 교사에게 말하는 해요체로 끝낸다: "~어요/~아요/~예요/~이에요/~해요/~세요". "~습니다", "~한다", "~이다" 로 끝내지 않는다. 예: "확인이 필요해 보여요", "원본을 직접 확인해 주세요".
- 반드시 JSON 하나만 출력한다.`;

  const user = `[오류 유형 집계] ${tallyText}
[다시 푼 문항] ${retriedText}
[요약 지표] 제출 ${stats.submitted}문항, 판정된 문항 정답률 ${stats.accuracy ?? "-"}%, 반복 오류 ${stats.repeatedError ? `${typeName(stats.repeatedError)} ${stats.repeatedCount}회` : "없음"}, 확인 필요 ${stats.reviewCount}개

[풀이 기록 (오래된 순)]
${records}

다음 형식의 JSON으로 답하라:
{"overview": "2~3문장 요약", "strengths": ["잘하고 있는 점 (최대 3개)"], "weakConcepts": [{"type": "오류 유형 코드", "concept": "실수 유형 이름", "evidence": "근거 풀이의 틀린 줄을 인용해 무엇을 잘못했는지", "proofs": [근거 풀이 번호]}], "checkQuestions": ["교사가 학생에게 물어볼 확인 질문 (최대 3개)"], "practice": ["보충 연습 방향 (최대 3개, 구체적인 문항 유형으로)"], "cautions": ["교사가 직접 확인해야 할 점 (없으면 빈 배열)"]}`;

  const text = await chat(system, user, 0); // 같은 기록이면 최대한 같은 요약이 나오게
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("AI 응답에서 요약을 찾지 못했어요. 다시 시도해 주세요.");
  const p = JSON.parse(json) as Partial<StudentSummary>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 5) : []);
  const summary: StudentSummary = {
    studentId,
    generatedAt: Date.now(),
    model: env("ANALYSIS_MODEL") ?? "solar-pro4",
    basedOn: subs.length,
    fingerprint,
    overview: String(p.overview ?? ""),
    strengths: arr(p.strengths),
    // 약점 정도는 AI 가 아니라 집계로 정한다 (같은 기록이면 늘 같게): 서로 다른 문항 2개 이상 높음, 1개 낮음.
    // 집계에 없는 유형(AI 가 지어낸 약점)은 빼고, 많이 나온 유형부터 (횟수가 같으면 교사 설문에서 많이 꼽힌 유형부터)
    weakConcepts: (Array.isArray(p.weakConcepts) ? (p.weakConcepts as { type?: string; concept?: string; evidence?: string; proofs?: unknown }[]) : [])
      .filter((w, i, all) => w?.type && tally.has(w.type) && all.findIndex((x) => x?.type === w.type) === i)
      .sort((a, b) => byCount(a.type!, b.type!))
      .slice(0, 4)
      .map((w) => ({
        concept: String(w.concept || ERROR_LABEL[w.type as keyof typeof ERROR_LABEL]),
        evidence: String(w.evidence ?? ""),
        priority: priorityOf(w.type!),
        proofs: proofsOf(w.type!, w.proofs),
      })),
    checkQuestions: arr(p.checkQuestions),
    practice: arr(p.practice),
    // 글씨·과정 생략 안내는 코드가 넣으므로 AI 가 쓴 같은 이야기는 뺀다 (같은 말이 두 번 나오지 않게)
    cautions: [
      ...arr(p.cautions).filter(
        (c) => (!handwritingCaution(subs, problems).length || !/글씨|OCR/.test(c)) && (!skippedStepsCaution(subs, problems).length || !/생략|과정 없이|답만/.test(c)),
      ),
      ...handwritingCaution(subs, problems),
      ...skippedStepsCaution(subs, problems),
    ].slice(0, 6),
  };
  return summary;
}

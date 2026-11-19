import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import Chick from "@/components/Chick";
import LogoutButton from "@/components/LogoutButton";
import SortPicker from "@/components/SortPicker";
import StudentTabs from "@/components/StudentTabs";
import { isAppUA } from "@/lib/app";
import { listStudentAssignments } from "@/lib/assignments";
import { getSession } from "@/lib/session";
import { SORT_COOKIE, SORT_LABEL, type SortKey } from "@/lib/studentSort";
import { listSubmissions } from "@/lib/store";
import { formatDue, statusOf, type Assignment, type Submission } from "@/lib/types";
import { verdictOf } from "@/lib/verdict";

export const dynamic = "force-dynamic";

const BADGE = {
  open: { label: "진행 중", cls: "bg-sage-soft text-[#5d7a50]" },
  scheduled: { label: "진행 중", cls: "bg-sage-soft text-[#5d7a50]" },
  closed: { label: "마감", cls: "bg-sand text-muted" },
  draft: { label: "비공개", cls: "bg-sand text-muted" },
};

// 아이패드 앱은 하단 탭으로 한 묶음씩 본다 (?tab=todo|done|past, 앱 기본은 todo). 웹은 한 화면에 모두
const TABS = ["todo", "done", "past"] as const;
type Tab = (typeof TABS)[number];

// 정렬 (?sort=, 없으면 지난번에 고른 값). 마감순은 '지금 풀 과제'에만, 그쪽 기본값
const isSort = (v: string | undefined): v is SortKey => !!v && v in SORT_LABEL;
function sortBy(list: Assignment[], key: SortKey) {
  const a = [...list];
  if (key === "due") a.sort((x, y) => (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity));
  if (key === "new") a.sort((x, y) => y.createdAt - x.createdAt);
  if (key === "old") a.sort((x, y) => x.createdAt - y.createdAt);
  if (key === "name") a.sort((x, y) => x.title.localeCompare(y.title, "ko", { numeric: true }));
  return a;
}

// 학생 홈: 공개된 과제 목록에서 골라 풀기
export default async function StudentHome({ searchParams }: { searchParams: Promise<{ tab?: string; sort?: string }> }) {
  const session = await getSession();
  if (session?.role !== "student") redirect("/login?role=student");
  const { tab: tabParam, sort: sortParam } = await searchParams;
  const app = isAppUA((await headers()).get("user-agent"));
  const tab: Tab | null = TABS.find((t) => t === tabParam) ?? (app ? "todo" : null);
  const sortOptions: SortKey[] = tab === "todo" || tab === null ? ["due", "new", "old", "name"] : ["new", "old", "name"];
  const wanted = isSort(sortParam) ? sortParam : (await cookies()).get(SORT_COOKIE)?.value;
  const sort: SortKey = isSort(wanted) && sortOptions.includes(wanted) ? wanted : sortOptions[0];
  const [assignments, subs] = await Promise.all([listStudentAssignments(session.id), listSubmissions({ studentId: session.id })]);
  const mine = new Set(subs.filter((s) => s.studentId === session.id).map((s) => s.problemId));
  const now = Date.now();
  const doneOf = (a: Assignment) => a.problems.filter((p) => mine.has(p.id)).length;
  // 지난 과제 채점 요약: 문항별 마지막 풀이 기준 (선생님 확인이 있으면 그것)
  const latest = new Map<string, Submission>();
  for (const s of [...subs].sort((x, y) => x.submittedAt - y.submittedAt)) latest.set(s.problemId, s);
  const scoreOf = (a: Assignment): Score => {
    const sc = { ok: 0, wrong: 0, hold: 0, none: 0 };
    for (const p of a.problems) {
      const s = latest.get(p.id);
      sc[verdictOf(s && { teacherErrorType: s.teacher?.confirmedAt ? s.teacher.errorType : null, aiCorrect: s.analysis?.correct })]++;
    }
    return sc;
  };
  const isClosed = (a: Assignment) => statusOf(a, now) === "closed";
  // 웹(한 화면)에서 마감순을 고르면 마감이 없는 다 푼·지난 과제는 최신순으로
  const restSort: SortKey = sort === "due" ? "new" : sort;
  const todo = sortBy(assignments.filter((a) => !isClosed(a) && doneOf(a) < a.problems.length), sort);
  const finished = sortBy(assignments.filter((a) => !isClosed(a) && doneOf(a) >= a.problems.length), restSort);
  const past = sortBy(assignments.filter(isClosed), restSort);
  const picker = <SortPicker value={sort} options={sortOptions} />;

  return (
    <div className="min-h-screen">
      {/* data-app-hide: 아이패드 앱에서는 숨기고 앱 상단 바를 쓴다 (lib/app.ts) */}
      <header data-app-hide className="flex items-center gap-3 border-b border-line px-6 py-3">
        <Link href="/" className="flex items-center gap-1.5 text-xl font-extrabold" title="풀이봄 홈">
          <Chick size={34} />
          풀이봄
        </Link>
        <span className="ml-2 hidden rounded-full bg-honey-soft px-4 py-1.5 text-sm font-semibold sm:inline">과제 풀어보기</span>
        <span className="ml-auto text-sm font-semibold">{session.name}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-honey-soft text-sm font-semibold" title={session.name}>
          {session.name[0]}
        </span>
        <LogoutButton />
      </header>

      {tab ? (
        <main className="mx-auto max-w-4xl px-4 py-8">
          <StudentTabs
            initial={tab}
            panels={{
              todo: (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <Chick size={52} pose="pencil" motion="bob" />
                    <h1 className="text-2xl font-extrabold">
                      {session.name}, 오늘은 <span className="text-olive">어떤 문제를 풀어 볼까요?</span>
                    </h1>
                  </div>
                  <TabHead title="지금 풀 과제" count={todo.length} note={`${SORT_LABEL[sort]}으로 보는 중`}>
                    {picker}
                  </TabHead>
                  {todo.length > 0 ? (
                    <div className="stagger grid gap-4 sm:grid-cols-2">
                      {todo.map((a) => (
                        <Card key={a.id} a={a} done={doneOf(a)} now={now} />
                      ))}
                    </div>
                  ) : (
                    <Empty text={assignments.length ? "지금 풀 과제를 모두 끝냈어요!" : "아직 받은 과제가 없어요."} />
                  )}
                </div>
              ),
              done: (
                <div className="flex flex-col gap-6">
                  <TabHead title="다 푼 과제" count={finished.length} note="마감 전이라 다시 볼 수 있어요">
                    {picker}
                  </TabHead>
                  {finished.length > 0 ? (
                    <div className="stagger grid gap-3 sm:grid-cols-2">
                      {finished.map((a) => (
                        <Card key={a.id} a={a} done={doneOf(a)} now={now} compact />
                      ))}
                    </div>
                  ) : (
                    <Empty text="아직 다 푼 과제가 없어요." />
                  )}
                </div>
              ),
              past: (
                <div className="flex flex-col gap-6">
                  <TabHead title="지난 과제" count={past.length} note="마감된 과제 · 눌러서 채점 결과 보기">
                    {picker}
                  </TabHead>
                  {past.length > 0 ? (
                    <div className="stagger grid gap-3 sm:grid-cols-2">
                      {past.map((a) => (
                        <Card key={a.id} a={a} done={doneOf(a)} now={now} compact score={scoreOf(a)} />
                      ))}
                    </div>
                  ) : (
                    <Empty text="아직 마감된 과제가 없어요." />
                  )}
                </div>
              ),
            }}
          />
        </main>
      ) : (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div className="flex items-center gap-3">
          <Chick size={52} pose="pencil" motion="bob" />
          <h1 className="text-2xl font-extrabold">
            {session.name}, 오늘은 <span className="text-olive">어떤 문제를 풀어 볼까요?</span>
          </h1>
        </div>
        {assignments.length > 0 && <div className="flex justify-end">{picker}</div>}

        {assignments.length === 0 && (
          <div className="rounded-3xl border border-dashed border-line p-10 text-center text-muted">
            <Chick size={64} className="mx-auto mb-3" />
            아직 받은 과제가 없어요.
          </div>
        )}

        {/* 지금 풀 과제(마감 빠른 순) → 다 푼 과제 → 지난 과제(접어 둠) */}
        {todo.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-bold">
              지금 풀 과제 <span className="text-sm font-normal text-muted">{todo.length}개</span>
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2">
              {todo.map((a) => (
                <Card key={a.id} a={a} done={doneOf(a)} now={now} />
              ))}
            </div>
          </section>
        ) : (
          assignments.length > 0 && (
            <div className="flex items-center justify-center gap-3 rounded-3xl border border-sage/50 bg-sage-soft/50 p-6 text-[#5d7a50]">
              <Chick size={44} motion="bob" />
              지금 풀 과제를 모두 끝냈어요!
            </div>
          )
        )}

        {finished.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-bold text-muted">
              다 푼 과제 <span className="text-sm font-normal">{finished.length}개 · 마감 전이라 다시 볼 수 있어요</span>
            </h2>
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {finished.map((a) => (
                <Card key={a.id} a={a} done={doneOf(a)} now={now} compact />
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-full border border-line bg-paper px-5 py-3 text-sm [&::-webkit-details-marker]:hidden">
              <span>
                <b>지난 과제</b> <span className="text-muted">{past.length}개 · 마감됨</span>
              </span>
              <span className="text-muted transition group-open:rotate-180">⌄</span>
            </summary>
            <div className="stagger mt-3 grid gap-3 sm:grid-cols-2">
              {past.map((a) => (
                <Card key={a.id} a={a} done={doneOf(a)} now={now} compact score={scoreOf(a)} />
              ))}
            </div>
          </details>
        )}
      </main>
      )}
    </div>
  );
}

function TabHead({ title, count, note, children }: { title: string; count: number; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <span className="text-sm text-muted">
        {count}개 · {note}
      </span>
      <div className="ml-auto">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line p-10 text-center text-muted">
      <Chick size={64} motion="bob" className="mx-auto mb-3" />
      {text}
    </div>
  );
}

type Score = { ok: number; wrong: number; hold: number; none: number };

function Card({ a, done, now, compact = false, score }: { a: Assignment; done: number; now: number; compact?: boolean; score?: Score }) {
  const st = statusOf(a, now);
  const total = a.problems.length;
  const closed = st === "closed";
  const left = a.dueAt && !closed ? a.dueAt - now : null;
  const soon = left !== null && left < 24 * 60 * 60 * 1000;
  return (
    <Link
      href={`/student/${a.id}`}
      className={`flex flex-col rounded-3xl border transition hover:-translate-y-0.5 hover:shadow-sm ${compact ? "gap-2 p-4" : "gap-3 p-5"} ${
        closed ? "border-line bg-sand/50" : done === total ? "border-sage/50 bg-sage-soft/50" : "border-honey/60 bg-paper"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${BADGE[st].cls}`}>{BADGE[st].label}</span>
        {a.supplement && <span className="rounded-full bg-honey px-2.5 py-0.5 text-[11px] font-semibold">나만의 보충 과제</span>}
        {done === total && <span className="rounded-full bg-sage px-2.5 py-0.5 text-[11px] text-white">다 풀었어요</span>}
      </div>
      <div className={`font-bold ${compact ? "text-base" : "text-lg"} ${closed ? "text-muted" : ""}`}>{a.title}</div>
      {score ? (
        // 지난 과제: 맞음·안 품 (틀린 수는 보여 주지 않음. 채점 중·확인 필요는 있을 때만)
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-sand">
            <div className="bg-sage" style={{ width: `${(score.ok / total) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-[#5d7a50]">○ 맞음 <b>{score.ok}</b></span>
            <span className="text-muted">안 풂 <b>{score.none}</b></span>
            {score.hold > 0 && <span className="text-muted">채점 중·확인 필요 <b>{score.hold}</b></span>}
            <span className="ml-auto text-muted">{total}문항</span>
          </div>
        </>
      ) : (
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-sand">
          <div className="h-2 rounded-full bg-sage" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="text-xs text-muted">
          {done}/{total}문항
        </span>
      </div>
      )}
      {!compact && (
        <div className={`text-xs ${soon ? "font-semibold text-[#b5624f]" : "text-muted"}`}>
          {a.dueAt ? `${formatDue(a.dueAt)} 마감${soon ? " · 곧 마감돼요!" : ""}` : "마감 기한 없음"}
        </div>
      )}
      {compact && closed && <div className="text-xs text-muted">마감됨 · 채점 결과 보기</div>}
    </Link>
  );
}

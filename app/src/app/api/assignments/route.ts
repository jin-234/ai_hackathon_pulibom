import { NextResponse } from "next/server";
import { createAssignment, listAssignments } from "@/lib/assignments";
import { buildProblems } from "@/lib/buildProblems";
import { resolveTeacherClass, teacherClass } from "@/lib/classes";
import { query } from "@/lib/db";
import { requireTeacher } from "@/lib/guard";

export const runtime = "nodejs";

// 내 반 과제 목록. ?class=반ID (없으면 첫 담당 반)
export async function GET(req: Request) {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  const cls = await resolveTeacherClass(t.session.id, new URL(req.url).searchParams.get("class"));
  if (!cls) return NextResponse.json([]);
  const list = await listAssignments({ classIds: [cls.id] });
  // 정해진 학생에게만 낸 과제(보충): 누구에게 냈는지 + 그 과제 문항을 몇 개 냈는지
  const targeted = list.filter((a) => a.studentIds?.length);
  if (!targeted.length) return NextResponse.json(list);
  const ids = [...new Set(targeted.flatMap((a) => a.studentIds!))];
  const [people, done] = await Promise.all([
    query<{ id: string; name: string; number: number | null }>(
      `SELECT s.id, s.name, m.number FROM students s LEFT JOIN class_members m ON m.student_id = s.id AND m.class_id = $2 WHERE s.id = ANY($1)`,
      [ids, cls.id],
    ),
    query<{ assignment_id: string; student_id: string; n: number }>(
      `SELECT p.assignment_id, s.student_id, count(DISTINCT s.problem_id)::int AS n
         FROM submissions s JOIN problems p ON p.id = s.problem_id
        WHERE p.assignment_id = ANY($1) GROUP BY 1, 2`,
      [targeted.map((a) => a.id)],
    ),
  ]);
  const who = new Map(people.map((p) => [p.id, p]));
  return NextResponse.json(
    list.map((a) =>
      a.studentIds?.length
        ? {
            ...a,
            recipients: a.studentIds
              .map((id) => ({
                id,
                name: who.get(id)?.name ?? id,
                number: who.get(id)?.number ?? null,
                solved: done.find((d) => d.assignment_id === a.id && d.student_id === id)?.n ?? 0,
              }))
              .sort((x, y) => (x.number ?? 999) - (y.number ?? 999)),
          }
        : a,
    ),
  );
}

// 과제 출제: 식만 받아서 정답·해설·개념은 서버에서 다시 계산·검증한다
export async function POST(req: Request) {
  const t = await requireTeacher();
  if ("error" in t) return t.error;
  const body = (await req.json()) as {
    classId?: string;
    title?: string;
    questions?: { question: string; answer?: string; solution?: string; concept?: string }[];
    publish?: boolean;
    dueAt?: number | null;
  };
  const cls = body.classId ? await teacherClass(t.session.id, body.classId) : undefined;
  if (!cls) return NextResponse.json({ error: "과제를 낼 반을 골라 주세요." }, { status: 400 });
  if (cls.archived) return NextResponse.json({ error: "보관된 반에는 과제를 낼 수 없어요." }, { status: 403 });
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "과제 이름을 입력해 주세요." }, { status: 400 });
  if (!body.questions?.length) return NextResponse.json({ error: "문항을 한 개 이상 넣어 주세요." }, { status: 400 });
  try {
    const problems = buildProblems(body.questions);
    if (typeof body.dueAt === "number" && body.dueAt <= Date.now()) throw new Error("마감 예약은 지금보다 뒤의 시간으로 정해 주세요.");
    return NextResponse.json(
      await createAssignment(title, problems, {
        classId: cls.id,
        publish: body.publish ?? true,
        dueAt: typeof body.dueAt === "number" ? body.dueAt : undefined,
      }),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// 예전 파일 저장 데이터(app/data/*.json, 풀이 이미지 *.png)를 DB로 옮긴다. 이미 있는 건 건너뜀 (여러 번 실행해도 안전)
//   npm run db:import
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { query } from "../src/lib/db";
import { createAssignment, DEMO_CLASS, getAssignment } from "../src/lib/assignments";
import { saveSubmission, updateSubmission } from "../src/lib/store";
import type { Assignment, StudentSummary, Submission } from "../src/lib/types";

async function main() {
  const DATA = path.join(process.cwd(), "data");
  const read = <T>(f: string) => JSON.parse(readFileSync(f, "utf-8")) as T;
  let a = 0, s = 0, m = 0, img = 0;

  // 1) 과제 (문항 id 를 그대로 유지해야 예전 풀이와 연결된다)
  const af = path.join(DATA, "assignments.json");
  if (existsSync(af)) {
    for (const x of read<(Assignment & { active?: boolean })[]>(af)) {
      if (await getAssignment(x.id)) continue;
      await createAssignment(x.title, x.problems, {
        classId: DEMO_CLASS, // 파일로 저장하던 시절엔 반이 하나뿐
        id: x.id,
        createdAt: x.createdAt || 0,
        publish: x.published ?? Boolean(x.active),
        dueAt: x.dueAt,
        studentIds: x.studentIds,
        supplement: x.supplement,
      });
      if (x.closedAt) await query(`UPDATE assignments SET closed_at = to_timestamp($2 / 1000.0) WHERE id = $1`, [x.id, x.closedAt]);
      a++;
    }
  }

  // 2) 풀이 + 풀이 이미지 (app/data/submissions/<id>.png)
  const sd = path.join(DATA, "submissions");
  if (existsSync(sd)) {
    const known = new Set((await query<{ id: string }>(`SELECT id FROM students`)).map((r) => r.id));
    const png = (id: string) => {
      const f = path.join(sd, `${id}.png`);
      return existsSync(f) ? readFileSync(f) : null;
    };
    for (const f of readdirSync(sd).filter((f) => f.endsWith(".json"))) {
      const x = read<Submission>(path.join(sd, f));
      if (!known.has(x.studentId)) { console.log("· 명단에 없는 학생이라 건너뜀:", x.id, x.studentId); continue; }
      const exists = await query(`SELECT 1 FROM submissions WHERE id = $1`, [x.id]);
      if (exists.length) continue;
      await saveSubmission(x, png(x.id));
      await updateSubmission(x.id, { ocrRaw: x.ocrRaw, analysis: x.analysis, teacher: x.teacher, statusMessage: x.statusMessage });
      s++;
    }
    // 이미지가 비어 있는 풀이는 같은 이름의 PNG 파일이 있으면 채운다
    for (const { id } of await query<{ id: string }>(`SELECT id FROM submissions WHERE image IS NULL`)) {
      const buf = png(id);
      if (!buf) continue;
      await query(`UPDATE submissions SET image = $2 WHERE id = $1`, [id, buf]);
      img++;
    }
  }

  // 3) AI 학습 요약
  const md = path.join(DATA, "summaries");
  if (existsSync(md)) {
    for (const f of readdirSync(md).filter((f) => f.endsWith(".json"))) {
      const x = read<StudentSummary>(path.join(md, f));
      const r = await query(`INSERT INTO student_summaries (student_id, data) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING student_id`, [x.studentId, JSON.stringify(x)]);
      m += r.length;
    }
  }
  console.log(`옮김: 과제 ${a}개 · 풀이 ${s}건 · 풀이 이미지 ${img}장 · AI 요약 ${m}개`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });

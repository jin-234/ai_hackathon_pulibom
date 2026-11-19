// DB 테이블 만들기 + 시연 기본 데이터 (여러 번 실행해도 안전)
//   npm run db:setup
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { query } from "../src/lib/db";
import { ensureDefaultAssignment } from "../src/lib/assignments";

async function main() {
  const dir = path.resolve(process.cwd(), "..", "db", "init");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await query(readFileSync(path.join(dir, f), "utf-8"));
    console.log("✓", f);
  }
  console.log((await ensureDefaultAssignment()) ? "✓ 기본 시연 과제 추가" : "· 과제가 이미 있어 기본 과제는 건너뜀");
  const [c] = await query<{ students: string; assignments: string; submissions: string }>(
    `SELECT (SELECT count(*) FROM students) AS students, (SELECT count(*) FROM assignments) AS assignments, (SELECT count(*) FROM submissions) AS submissions`,
  );
  console.log(`학생 ${c.students}명 · 과제 ${c.assignments}개 · 풀이 ${c.submissions}건`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });

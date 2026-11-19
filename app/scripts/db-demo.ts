// 시연용 추가 데이터 (db/demo/*.sql): 학년이 바뀌어도 기록이 이어지는 예시 반·학생·풀이
//   npm run db:demo   (먼저 npm run db:setup. 여러 번 실행해도 안전)
// ⚠ 팀 공용 DB에 넣으면 모든 팀원 화면에 보인다. 이 데이터를 읽는 코드(반 구분)가 main 에 합쳐진 뒤에 넣을 것
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { query } from "../src/lib/db";

async function main() {
  const dir = path.resolve(process.cwd(), "..", "db", "demo");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await query(readFileSync(path.join(dir, f), "utf-8"));
    console.log("✓", f);
  }
  const [c] = await query<{ classes: string; students: string }>(
    `SELECT (SELECT count(*) FROM classes) AS classes, (SELECT count(*) FROM students) AS students`,
  );
  console.log(`반 ${c.classes}개 · 학생 ${c.students}명`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });

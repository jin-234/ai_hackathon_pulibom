// DB 없이 OCR 폴백 체인 + Claude 분석만 돌려보는 스크립트
// 사용: npm run test:pipeline -- <풀이이미지.png> "<문제>" <정답> <학생최종답>
// 예:   npm run test:pipeline -- ./sample.png "3x + 6 = 15" 3 7
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeSolution } from "../lib/analyze";
import { isCorrectAnswer } from "../lib/answer";
import { runOcrChain } from "../lib/ocr";

async function main() {
  const [img, content = "3x + 6 = 15", answer = "3", given = ""] = process.argv.slice(2);
  if (!img) throw new Error("이미지 경로를 넣어주세요");
  const dir = await mkdtemp(path.join(tmpdir(), "pulibom-test-"));
  try {
    await copyFile(img, path.join(dir, "solution.png"));
    const image = await readFile(img);

    console.time("ocr");
    const { result, attempts } = await runOcrChain(image, dir);
    console.timeEnd("ocr");
    console.log("OCR 시도:", attempts.map((a) => `${a.engine}:${a.ok ? "OK" : a.reason}`).join(" → "));
    if (!result) return console.log("→ 모든 OCR 실패: 확인 필요");
    console.log(`OCR 결과 (${result.engine}, conf=${result.confidence}):\n${result.text}\n`);

    console.time("analysis");
    const analysis = await analyzeSolution(
      dir,
      { content, answer, solution: "(모범 풀이 생략)" },
      given || null,
      isCorrectAnswer(given, answer),
      result,
    );
    console.timeEnd("analysis");
    console.log(JSON.stringify(analysis, null, 2));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

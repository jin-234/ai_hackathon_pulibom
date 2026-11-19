// 필기 인식(OCR) 정확도 테스트: DB 에 저장된 획을 지금 파이프라인으로 다시 읽고, 사람이 적어 둔 정답 줄과 비교한다.
//   정답 라벨: data/ocrbench/labels.json  ([{ "id": 제출 id, "lines": ["2x=11-3", "2x=8", "x=4"] }], data/ 는 git 에 안 올라감)
//   DB 에는 아무것도 쓰지 않는다 (Upstage OCR·Solar 만 호출).
//
//   npm run test:ocr            요약 + 틀린 풀이
//   npm run test:ocr -- --all   맞은 풀이도 출력
//   npm run test:ocr -- --no-vision   OCR 이 확신 없는 줄을 Claude 로 다시 읽는 단계 끄기 (비교용)
//   npm run test:ocr -- --vision=lines | --vision=full   다시 읽는 방식 (기본 .env VISION_MODE, 없으면 lines)
import { readFileSync } from "fs";
import { correctOcr } from "../src/lib/ai";
import { query } from "../src/lib/db";
import { ocrFromStrokes } from "../src/lib/ocrImage";
import type { Stroke } from "../src/lib/types";

type Label = { id: string; lines: string[]; equation?: boolean }; // equation: x 에 대한 방정식 문항 (기본 true)
const norm = (l: string) => l.replace(/\s/g, "").replace(/[−–—]/g, "-");

async function main() {
  const showAll = process.argv.includes("--all");
  const vision = !process.argv.includes("--no-vision");
  const visionMode = process.argv.find((a) => a.startsWith("--vision="))?.split("=")[1] as "full" | "lines" | undefined;
  const labels = JSON.parse(readFileSync("data/ocrbench/labels.json", "utf-8")) as Label[];
  const rows = await query<{ id: string; strokes: Stroke[] }>(`SELECT id, strokes FROM submissions WHERE id = ANY($1)`, [labels.map((l) => l.id)]);
  const strokesOf = new Map(rows.map((r) => [r.id, r.strokes]));

  let rawLines = 0, fixedLines = 0, total = 0, rawSubs = 0, fixedSubs = 0, lineCountOk = 0;
  for (const label of labels) {
    const strokes = strokesOf.get(label.id);
    if (!strokes) { console.log(`  ? ${label.id}: DB 에 없음`); continue; }
    const ocr = await ocrFromStrokes(strokes, "x", { vision, visionMode });
    const raw = ocr?.lines ?? [];
    const fixed = raw.length ? await correctOcr(raw, ocr?.fractions, label.equation !== false) : [];
    const hit = (got: string[]) => label.lines.filter((t, i) => norm(got[i] ?? "") === norm(t)).length;
    const r = hit(raw), f = hit(fixed);
    rawLines += r; fixedLines += f; total += label.lines.length;
    if (r === label.lines.length && raw.length === label.lines.length) rawSubs++;
    const ok = f === label.lines.length && fixed.length === label.lines.length;
    if (ok) fixedSubs++;
    if (fixed.length === label.lines.length) lineCountOk++;
    if (!ok || showAll) console.log(`  ${ok ? "✓" : "✗"} 정답 ${label.lines.join(" / ")}\n      OCR  ${raw.join(" / ") || "(없음)"}\n      보정 ${fixed.join(" / ") || "(없음)"}`);
    await new Promise((res) => setTimeout(res, 500)); // 요청 한도(429)
  }
  const pct = (a: number, b: number) => `${a}/${b} (${Math.round((a / b) * 100)}%)`;
  console.log(`\n━━━━ 결과 (${labels.length}개 풀이) ━━━━
  줄 수가 맞음:        ${pct(lineCountOk, labels.length)}
  줄 정확도  OCR 그대로: ${pct(rawLines, total)}  /  보정 후: ${pct(fixedLines, total)}
  풀이 전체가 맞음  OCR 그대로: ${pct(rawSubs, labels.length)}  /  보정 후: ${pct(fixedSubs, labels.length)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("✗", e.message); process.exit(1); });

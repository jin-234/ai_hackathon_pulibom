import sharp from "sharp";
import { runOcr } from "./ai";
import { LOW_OCR_CONFIDENCE, type Stroke } from "./types";
import { VISION_CONFIDENCE, VISION_MODE, hasVision, readWhole, rereadLines, suspectLines, type VisionMode } from "./vision";

// OCR 전용 이미지: 저장된 획을 다시 그린다 (교사 화면의 원본 이미지는 그대로 둔다).
// 캔버스 PNG 를 그대로 보내면 넓은 흰 바탕에 얇은 글씨라 줄이 쪼개지고 글자를 놓친다.
// - 모든 색을 굵은 검정 선으로, 형광펜은 뺀다.
// - 획을 쓴 순서로 줄을 나누고, 줄마다 기울기를 펴서 줄 사이를 넉넉히 벌려 다시 놓는다.
//   (줄 간격이 좁거나 비스듬히 쓰면 OCR이 두 줄을 한 줄로 합치거나 한 줄을 통째로 빠뜨린다)
// - 작은 글씨는 글자 높이가 GLYPH_TARGET 쯤 되도록 키운다 (최대 2배, 줄이지는 않음: 큰 글씨를 더 키우면 못 읽음).
// - 꽉 맞게 자르면 숫자 하나짜리 풀이를 못 읽어서, 여백(글자 높이의 절반)과 최소 크기를 둔다.
// 줄 위치(bands)를 같이 돌려줘서 OCR 단어를 정확한 줄에 배정할 수 있게 한다.
const PAD = 24;
const MIN_SIDE = 600;
const GLYPH_TARGET = 60;
const MAX_SCALE = 2;
const MAX_SIDE = 2400;
const LINE_GAP = 1.1; // 다시 놓을 때 줄 사이 간격 (글자 높이 배수)

export type OcrImage = { png: Buffer; width: number; height: number; bands: { top: number; bottom: number; fractions: number }[] };

type Box = { s: Stroke; x0: number; x1: number; y0: number; y1: number; cx: number; cy: number };

function box(s: Stroke): Box {
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { s, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 글자 높이 추정: 획 높이의 75% 지점 ('-', '=' 처럼 납작한 획에 끌려가지 않게)
function glyphHeight(boxes: Box[]) {
  const hs = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  return Math.max(hs[Math.floor(hs.length * 0.75)] ?? 0, 10);
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// 줄 나누기: 쓴 순서대로 보다가 '왼쪽으로 크게 돌아가면서 아래로 내려가면' 새 줄.
// 분수(위·아래로 쌓인 수)는 왼쪽으로 크게 돌아가지 않아서 한 줄에 남는다.
// 나중에 돌아와 고쳐 쓴 획은 가장 가까운 줄로 옮긴다.
function splitLines(boxes: Box[], gh: number): Box[][] {
  const lines: Box[][] = [];
  let cur: Box[] = [];
  for (const b of boxes) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const lineCy = median(cur.map((c) => c.cy));
      const wentBack = b.x0 < prev.x1 - 1.5 * gh;
      const down = b.cy - lineCy;
      if ((wentBack && down > 0.6 * gh) || down > 1.6 * gh) {
        lines.push(cur);
        cur = [];
      }
    }
    cur.push(b);
  }
  if (cur.length) lines.push(cur);

  // 늦게 덧쓴 획 재배치
  const centers = lines.map((l) => median(l.map((b) => b.cy)));
  const out: Box[][] = lines.map(() => []);
  lines.forEach((l, li) =>
    l.forEach((b) => {
      let best = li;
      if (Math.abs(b.cy - centers[li]) > 0.7 * gh)
        centers.forEach((c, ci) => {
          if (Math.abs(b.cy - c) < Math.abs(b.cy - centers[best])) best = ci;
        });
      out[best].push(b);
    }),
  );
  return out.filter((l) => l.length).sort((a, b) => median(a.map((x) => x.cy)) - median(b.map((x) => x.cy)));
}

// 줄 기울기: 획 중심의 최소제곱 직선 (획 3개 이상일 때만, 너무 큰 값은 자른다)
function slopeOf(line: Box[]) {
  if (line.length < 3) return 0;
  const mx = line.reduce((s, b) => s + b.cx, 0) / line.length;
  const my = line.reduce((s, b) => s + b.cy, 0) / line.length;
  let num = 0, den = 0;
  for (const b of line) {
    num += (b.cx - mx) * (b.cy - my);
    den += (b.cx - mx) ** 2;
  }
  return den ? Math.max(-0.25, Math.min(0.25, num / den)) : 0;
}

type Ink = { pts: { x: number; y: number }[]; width: number };

function inkBox(i: Ink) {
  const xs = i.pts.map((p) => p.x);
  const ys = i.pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { ink: i, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 위아래로 쌓은 분수를 '(분자)/(분모)' 한 줄로 펴서 다시 그린다.
// OCR은 쌓인 분수를 못 읽고 분자를 통째로 빠뜨린다 ('x/2 + 1 = 4' → '2+1=4', 신뢰도는 높게).
// 분수 막대: 넓고 납작한 획인데 바로 위와 아래에 '키 있는' 획이 있는 것 ('=' 는 위아래가 납작한 획뿐이라 제외).
function inlineFractions(line: Ink[], gh: number): { ink: Ink[]; fractions: number } {
  let items = line.map(inkBox);
  let fractions = 0;
  const tall = (b: ReturnType<typeof inkBox>) => b.y1 - b.y0 > 0.25 * gh;
  const bars = items
    .filter((b) => b.x1 - b.x0 > 0.6 * gh && b.y1 - b.y0 < 0.3 * (b.x1 - b.x0))
    .sort((a, b) => b.x0 - a.x0); // 오른쪽부터: 앞쪽 분수를 펴며 뒤를 미는 게 이미 처리한 분수에 영향 없게
  const strokeW = line[0]?.width ?? 3.2;
  const synth = (pts: [number, number][]): Ink => ({ width: strokeW, pts: pts.map(([x, y]) => ({ x, y })) });
  const paren = (x: number, yc: number, h: number, open: boolean): Ink =>
    synth(Array.from({ length: 9 }, (_, i) => {
      const a = ((open ? 125 + (110 * i) / 8 : -55 + (110 * i) / 8) * Math.PI) / 180;
      return [x + (open ? 0.3 : -0.05) * h + 0.35 * h * Math.cos(a), yc + 0.6 * h * Math.sin(a)];
    }));

  for (const bar of bars) {
    if (!items.includes(bar)) continue;
    const span = (b: ReturnType<typeof inkBox>) => b.cx > bar.x0 - 0.1 * gh && b.cx < bar.x1 + 0.1 * gh && b !== bar;
    const num = items.filter((b) => span(b) && b.cy < bar.cy && bar.cy - b.y1 < 0.8 * gh);
    const den = items.filter((b) => span(b) && b.cy > bar.cy && b.y0 - bar.cy < 0.8 * gh);
    if (!num.some(tall) || !den.some(tall)) continue;
    fractions++;

    const rest = items.filter((b) => b !== bar && !num.includes(b) && !den.includes(b));
    const yc = rest.length ? median(rest.map((b) => b.cy)) : bar.cy;
    const out: Ink[] = [];
    let x = bar.x0;
    const place = (group: ReturnType<typeof inkBox>[]) => {
      const gx0 = Math.min(...group.map((b) => b.x0)), gx1 = Math.max(...group.map((b) => b.x1));
      const gy0 = Math.min(...group.map((b) => b.y0)), gy1 = Math.max(...group.map((b) => b.y1));
      const s = Math.min(1.6, Math.max(1, (0.9 * gh) / Math.max(gy1 - gy0, 1)));
      // 분자·분모에 +, - 가 있을 때만 괄호로 묶는다 ((x+1)/3). '2x/5' 는 괄호 없이도 값이 같고, 괄호를 붙이면 오히려 잘못 읽는다
      const wide = group.some((b) => b.x1 - b.x0 > 0.2 * gh && b.y1 - b.y0 < 0.3 * (b.x1 - b.x0));
      const h = (gy1 - gy0) * s;
      if (wide) { out.push(paren(x, yc, h, true)); x += 0.45 * h; }
      for (const b of group)
        out.push({ width: b.ink.width, pts: b.ink.pts.map((p) => ({ x: x + (p.x - gx0) * s, y: yc + (p.y - (gy0 + gy1) / 2) * s })) });
      x += (gx1 - gx0) * s + 0.1 * gh;
      if (wide) { out.push(paren(x, yc, h, false)); x += 0.45 * h; }
    };
    place(num);
    // 빗금은 숫자보다 길고 많이 기울게, 앞뒤를 띄워서 그린다 (짧고 곧으면 '1' 로 읽힘)
    x += 0.15 * gh;
    out.push(synth([[x + 0.7 * gh, yc - 0.75 * gh], [x, yc + 0.6 * gh]]));
    x += 0.95 * gh;
    place(den);
    const shift = x - bar.x1;
    const moved = rest.map((b) =>
      b.cx > bar.x1 ? inkBox({ width: b.ink.width, pts: b.ink.pts.map((p) => ({ x: p.x + shift, y: p.y })) }) : b,
    );
    items = [...moved, ...out.map(inkBox)];
  }
  return { ink: items.map((b) => b.ink), fractions };
}

// 획이 어느 쪽으로 휘었는지: 위→아래로 이은 현에서 가장 멀리 떨어진 점이 오른쪽(+1, ')' 'ㄱ' 'ɔ')인지 왼쪽(-1, '(' 'ㄴ' 'c')인지.
// 휜 정도가 작으면(직선 '1', '/') 0
function bulge(s: Stroke): number {
  const pts = s.points;
  const [a, b] = pts[0].y <= pts[pts.length - 1].y ? [pts[0], pts[pts.length - 1]] : [pts[pts.length - 1], pts[0]];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return 0;
  let best = 0;
  for (const p of pts) {
    const d = (dy * (p.x - a.x) - dx * (p.y - a.y)) / len; // 위→아래 현 기준 +: 오른쪽(화면 좌표)
    if (Math.abs(d) > Math.abs(best)) best = d;
  }
  return Math.abs(best) < 0.18 * len ? 0 : Math.sign(best);
}

// 한국 학생이 두 획으로 쓰는 x ('ɔ'+'c', 'ㄱ'+'ㄴ', ')'+'(') 를 찾아 반듯한 X 두 직선으로 바꿔 그린다.
// OCR 은 이 x 를 'つく', 'フレ', '2', 'C' 로 읽는데, 반듯한 X 는 잘 읽는다 (× 로 읽어도 normalizeMath 가 x 로).
// 조건: 이어 쓴 두 획이 ')' 다음 '(' 모양, 키가 글자 높이쯤이고 비슷하며, 가까이 붙어 있다.
function redrawTwoStrokeX(ink: Stroke[], gh: number): { ink: Stroke[]; xs: number } {
  const out: Stroke[] = [];
  let xs = 0;
  for (let i = 0; i < ink.length; i++) {
    const a = ink[i], b = ink[i + 1];
    if (b) {
      const A = box(a), B = box(b);
      const ha = A.y1 - A.y0, hb = B.y1 - B.y0;
      const top = Math.min(A.y0, B.y0), bottom = Math.max(A.y1, B.y1);
      const overlap = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      const width = Math.max(A.x1, B.x1) - Math.min(A.x0, B.x0);
      const ok =
        bulge(a) > 0 && bulge(b) < 0 &&
        ha > 0.35 * gh && hb > 0.35 * gh && ha < 1.5 * gh && hb < 1.5 * gh &&
        Math.max(ha, hb) / Math.min(ha, hb) < 1.4 && // 키가 많이 다르면 x 가 아님 ('7' + 'ɔ')
        overlap > 0.5 * Math.min(ha, hb) &&
        B.cx > A.cx && B.x0 - A.x1 < 0.6 * gh && // b 가 오른쪽에서 맞닿거나 가깝다
        width < 3.2 * (bottom - top) && width > 0.4 * (bottom - top); // 학생들은 x 를 넓게 쓴다 (높이의 2~3배)
      if (ok) {
        const x0 = Math.min(A.x0, B.x0), x1 = Math.max(A.x1, B.x1);
        const pad = 0.1 * (x1 - x0);
        const line = (p: [number, number], q: [number, number], t: number): Stroke => ({
          ...a,
          id: `${a.id}-x${t}`,
          points: [0, 0.5, 1].map((k) => ({ x: p[0] + (q[0] - p[0]) * k, y: p[1] + (q[1] - p[1]) * k, t: a.points[0].t + t })),
        });
        out.push(line([x0 + pad, top], [x1 - pad, bottom], 0), line([x1 - pad, top], [x0 + pad, bottom], 1));
        xs++;
        i++;
        continue;
      }
    }
    out.push(a);
  }
  return { ink: out, xs };
}

// 원본 캔버스 좌표로 본 줄 위치 (OCR 과 같은 방식으로 줄을 나눈다). 교사 화면에서 틀린 줄을 원본 이미지에 표시할 때 쓴다.
export function lineBoxesOf(strokes: Stroke[], v = "x"): { x0: number; y0: number; x1: number; y1: number }[] {
  const drawn = strokes
    .filter((s) => s.tool !== "highlighter" && s.points.length > 0)
    .sort((a, b) => a.points[0].t - b.points[0].t);
  if (drawn.length === 0) return [];
  const gh = glyphHeight(drawn.map(box));
  const ink = v === "x" ? redrawTwoStrokeX(drawn, gh).ink : drawn;
  return splitLines(ink.map(box), gh).map((l) => ({
    x0: Math.min(...l.map((b) => b.x0)),
    y0: Math.min(...l.map((b) => b.y0)),
    x1: Math.max(...l.map((b) => b.x1)),
    y1: Math.max(...l.map((b) => b.y1)),
  }));
}

export async function strokesToOcrImage(strokes: Stroke[], v = "x"): Promise<OcrImage | null> {
  const drawn = strokes
    .filter((s) => s.tool !== "highlighter" && s.points.length > 0)
    .sort((a, b) => a.points[0].t - b.points[0].t);
  if (drawn.length === 0) return null;
  // 글자 높이는 원래 획으로 잰다 (다시 그린 X 로 재면 줄 나누기가 달라진다)
  const gh = glyphHeight(drawn.map(box));
  // 두 획 x 다시 그리기는 x 문항만 (y·a·b 등을 X 로 바꾸면 안 된다)
  const ink = v === "x" ? redrawTwoStrokeX(drawn, gh).ink : drawn;
  const boxes = ink.map(box);

  // 줄마다 기울기를 펴고(분수는 한 줄로 펴고) 위에서부터 일정한 간격으로 다시 쌓는다
  const placed: Ink[] = [];
  const lineSpans: { top: number; bottom: number; fractions: number }[] = [];
  let cursor = 0;
  for (const line of splitLines(boxes, gh)) {
    const k = slopeOf(line);
    const x0 = Math.min(...line.map((b) => b.x0));
    const straight = line.map((b) => ({ width: b.s.width, pts: b.s.points.map((p) => ({ x: p.x, y: p.y - k * (p.x - x0) })) }));
    const { ink: fixed, fractions } = inlineFractions(straight, gh);
    const top = Math.min(...fixed.flatMap((f) => f.pts.map((p) => p.y)));
    const bottom = Math.max(...fixed.flatMap((f) => f.pts.map((p) => p.y)));
    const dy = cursor - top;
    for (const f of fixed) placed.push({ width: f.width, pts: f.pts.map((p) => ({ x: p.x, y: p.y + dy })) });
    lineSpans.push({ top: cursor, bottom: cursor + bottom - top, fractions });
    cursor += bottom - top + LINE_GAP * gh;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of placed)
    for (const p of f.pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  const pad = Math.max(PAD, gh / 2);
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const want = Math.min(MAX_SCALE, Math.max(1, GLYPH_TARGET / gh));
  const scale = Math.min(want, MAX_SIDE / (maxX - minX), MAX_SIDE / (maxY - minY));
  // 최소 크기에 못 미치면 가운데 두고 여백을 늘린다
  const growX = Math.max(0, MIN_SIDE / scale - (maxX - minX)) / 2;
  const growY = Math.max(0, MIN_SIDE / scale - (maxY - minY)) / 2;
  minX -= growX; maxX += growX; minY -= growY; maxY += growY;
  const w = Math.ceil((maxX - minX) * scale);
  const h = Math.ceil((maxY - minY) * scale);

  const paths = placed
    .map((f) => {
      const pts = f.pts.map((p) => `${((p.x - minX) * scale).toFixed(1)},${((p.y - minY) * scale).toFixed(1)}`);
      if (pts.length === 1) pts.push(pts[0]); // 점 하나짜리 획(소수점 등)도 보이게
      const width = (Math.max(f.width, 3) * scale * 1.4).toFixed(1);
      return `<polyline points="${pts.join(" ")}" stroke-width="${width}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  // 줄 경계는 줄 사이 간격의 가운데
  const half = (LINE_GAP * gh) / 2;
  const bands = lineSpans.map((l) => ({ top: (l.top - half - minY) * scale, bottom: (l.bottom + half - minY) * scale, fractions: l.fractions }));
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), width: w, height: h, bands };
}

// 줄 하나만 잘라낸 이미지 (위아래로 흰 여백을 붙여 너무 납작하지 않게)
async function cropBand(img: OcrImage, i: number) {
  const top = Math.max(0, Math.floor(img.bands[i].top));
  const bottom = Math.min(img.height, Math.ceil(img.bands[i].bottom));
  const extra = Math.max(0, Math.ceil((300 - (bottom - top)) / 2));
  return sharp(img.png)
    .extract({ left: 0, top, width: img.width, height: Math.max(1, bottom - top) })
    .extend({ top: extra, bottom: extra, background: "#ffffff" })
    .png()
    .toBuffer();
}

const MAX_RETRY = 4;

// 획 → OCR. 전체 이미지를 한 번 읽고, 빈 줄·신뢰도가 낮은 줄은 그 줄만 잘라 다시 읽어 더 확실한 쪽을 쓴다.
// (OCR이 깨끗한 줄을 통째로 빠뜨리는 경우가 있는데, 줄 수는 획으로 이미 알고 있다)
// 획에서 찾은 분수보다 '/' 가 적게 읽힌 줄('x/2' → 'x12')도 다시 읽는다.
// (돌려주는 신뢰도는 OCR 값 그대로. '/' 부족은 fractions 로 넘겨 보정 단계에서 되살리고 판단한다)
const SUSPECT = 0.5;

// opts.vision: OCR 이 확신 없는 줄을 Mathpix → Claude 로 다시 읽기 (기본 켬)
export async function ocrFromStrokes(strokes: Stroke[], v = "x", opts: { vision?: boolean; visionMode?: VisionMode } = {}) {
  const img = await strokesToOcrImage(strokes, v);
  if (!img) return null;
  const first = await runOcr(img.png, img.bands, v);
  const lines = [...first.lines];
  const fractions = img.bands.map((b) => b.fractions);
  const slashOk = (line: string, i: number) => (line.match(/\//g)?.length ?? 0) >= fractions[i];
  const confidences = [...first.confidences];
  const score = (line: string, c: number, i: number) => (slashOk(line, i) ? c : Math.min(c, SUSPECT));
  const scores = lines.map((l, i) => score(l, confidences[i], i));
  const retry = scores
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c < LOW_OCR_CONFIDENCE)
    .sort((a, b) => a.c - b.c)
    .slice(0, MAX_RETRY);
  for (const { i } of retry) {
    try {
      await new Promise((r) => setTimeout(r, 700)); // 연달아 보내면 요청 한도(429)에 걸린다
      const crop = await cropBand(img, i);
      const again = await runOcr(crop, [{ top: 0, bottom: Infinity }], v);
      const line = again.lines[0];
      if (line && score(line, again.confidences[0], i) > scores[i]) {
        lines[i] = line;
        confidences[i] = again.confidences[0];
        scores[i] = score(line, again.confidences[0], i);
      }
    } catch {
      // 다시 읽기 실패(요청 한도 등)는 첫 결과를 그대로 쓴다
    }
  }
  // OCR 이 끝내 확신하지 못한 줄이 있으면 Mathpix → Claude 로 다시 읽는다 (빈 줄도 채울 수 있다)
  let vision: { model: string; mode: VisionMode; ocr: string[]; lines: { line: number; ocr: string; vision: string }[] } | undefined;
  if (opts.vision !== false && hasVision()) {
    const suspects = suspectLines(lines, confidences, fractions, v);
    const mode = opts.visionMode ?? VISION_MODE();
    if (suspects.length && mode === "full") {
      // 이미지 전체를 다시 읽어 통째로 바꾼다 (줄 수가 달라질 수 있음 → 획에서 찾은 분수 수는 줄 수가 같을 때만 유지)
      const whole = await readWhole(img.png, v);
      if (whole.lines.length) {
        const sameCount = whole.lines.length === lines.length;
        return {
          lines: whole.lines,
          confidences: whole.lines.map(() => VISION_CONFIDENCE),
          fractions: sameCount ? fractions : whole.lines.map(() => 0),
          raw: { ...(first.raw as object), pulibomVision: { model: whole.model ?? "", mode, ocr: lines, lines: [], attempts: whole.attempts } },
        };
      }
    } else if (suspects.length) {
      const crops = new Map<number, Buffer>();
      for (const i of suspects) crops.set(i, await cropBand(img, i));
      const reread = await rereadLines(crops, lines, v);
      if (reread.lines.size) {
        vision = { model: reread.model ?? "", mode, ocr: [...lines], lines: [] };
        for (const [i, line] of reread.lines) {
          vision.lines.push({ line: i, ocr: lines[i], vision: line });
          lines[i] = line;
          confidences[i] = VISION_CONFIDENCE;
        }
      }
    }
  }
  // 끝내 아무것도 못 읽은 줄은 뺀다
  const keep = lines.map((l, i) => i).filter((i) => lines[i]);
  return {
    lines: keep.map((i) => lines[i]),
    confidences: keep.map((i) => confidences[i]),
    fractions: keep.map((i) => fractions[i]),
    // 원래 OCR 결과 + LLM 이 다시 읽은 줄 기록 (submissions.ocr_raw)
    raw: vision ? { ...(first.raw as object), pulibomVision: vision } : first.raw,
  };
}

import sharp from "sharp";
import { query } from "./db";
import { IMAGE_ID } from "./figure";

// 선생님이 올린 문제 그림 (DB: problem_images). 받은 파일은 sharp 로 다시 저장한다
//  → 사진의 위치·기기 정보(EXIF)가 지워지고, 1600px 이하로 줄어 DB·화면 모두 가볍다
const MAX_BYTES = 8 * 1024 * 1024; // 원본 파일 상한
const MAX_SIDE = 1600;

export async function saveProblemImage(teacherId: string, file: Blob): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("그림 파일이 너무 커요 (8MB 이하).");
  const input = Buffer.from(await file.arrayBuffer());
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new Error("그림 파일을 읽을 수 없어요. PNG·JPG 파일을 올려 주세요.");
  }
  if (!meta.format || !["png", "jpeg", "webp", "gif", "heif"].includes(meta.format)) throw new Error("PNG·JPG·WEBP 그림만 올릴 수 있어요.");
  const base = sharp(input).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  // 선 그림(PNG)은 PNG 그대로, 사진은 JPG 로
  const png = meta.format === "png" || meta.format === "gif";
  const data = png ? await base.png({ compressionLevel: 9, palette: true }).toBuffer() : await base.flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const id = `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await query(`INSERT INTO problem_images (id, teacher_id, mime, data) VALUES ($1, $2, $3, $4)`, [id, teacherId, png ? "image/png" : "image/jpeg", data]);
  return id;
}

export async function readProblemImage(id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!IMAGE_ID.test(id)) return null;
  const rows = await query<{ mime: string; data: Buffer }>(`SELECT mime, data FROM problem_images WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

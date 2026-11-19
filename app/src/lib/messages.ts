import { randomBytes } from "crypto";
import { query } from "./db";

// 학생 ↔ 선생님 메시지 (DB: messages). 학생 한 명당 대화방 하나
//  첨부 (db/init/16_message_attachments.sql): 메시지에 붙인 영상·웹 링크(본문에서 찾음)와 선생님이 올린 파일
export type Sender = "student" | "teacher";
export type Attachment =
  | { kind: "link"; url: string; youtubeId?: string }
  | { kind: "file"; id: string; name: string; mime: string; size: number; url: string }; // url: /api/message-files/<id>?t=<token>
export type Message = { id: number; sender: Sender; senderName: string; body: string; createdAt: number; readAt: number | null; attachments: Attachment[] };

type Row = { id: string; sender: Sender; sender_name: string; body: string; created_at: Date; read_at: Date | null; attachments?: Attachment[] | null };
const toMessage = (r: Row): Message => ({
  id: Number(r.id),
  sender: r.sender,
  senderName: r.sender_name,
  body: r.body,
  createdAt: r.created_at.getTime(),
  readAt: r.read_at ? r.read_at.getTime() : null,
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
});

export const MAX_BODY = 1000;
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel 함수 요청 크기 한도(4.5MB) 안
const MAX_LINKS = 5;

// 대화 (오래된 것부터, 최근 200개). 첨부 칸은 to_jsonb 로 읽어 16_message_attachments.sql 전 DB 에서도 동작
export async function listMessages(studentId: string): Promise<Message[]> {
  const rows = await query<Row>(
    `SELECT * FROM (
       SELECT id, sender, sender_name, body, created_at, read_at, to_jsonb(m)->'attachments' AS attachments
         FROM messages m WHERE student_id = $1 ORDER BY id DESC LIMIT 200
     ) m ORDER BY id`,
    [studentId],
  );
  return rows.map(toMessage);
}

// 본문에 붙여 넣은 웹 주소 → 링크 첨부 (유튜브는 영상 id 도: 썸네일·앱에서 바로 열기)
export function linksIn(text: string): Attachment[] {
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map((u) => u.replace(/[).,!?\]]+$/, "")))].slice(0, MAX_LINKS);
  return urls.flatMap((url) => {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return [];
      const host = u.hostname.replace(/^(www\.|m\.)/, "");
      const yt =
        host === "youtu.be"
          ? u.pathname.slice(1)
          : host === "youtube.com" || host === "youtube-nocookie.com"
            ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? "")
            : "";
      return [{ kind: "link" as const, url: u.toString(), ...(/^[\w-]{11}$/.test(yt) ? { youtubeId: yt } : {}) }];
    } catch {
      return [];
    }
  });
}

// files: 먼저 saveMessageFile 로 저장한 파일 첨부. 글 없이 파일만 보내면 본문은 파일 이름
export async function sendMessage(studentId: string, from: { sender: Sender; id: string; name: string }, body: string, files: Attachment[] = []): Promise<Message> {
  let text = body.trim().slice(0, MAX_BODY);
  const attachments = [...files, ...linksIn(text)];
  if (!text && files.length) text = `📎 ${files.map((f) => (f.kind === "file" ? f.name : "")).join(", ")}`.slice(0, MAX_BODY);
  if (!text) throw new Error("메시지를 입력해 주세요.");
  // 첨부가 없으면 예전처럼 (16_message_attachments.sql 전 DB 에서도 보내지게)
  const [row] = attachments.length
    ? await query<Row>(
        `INSERT INTO messages (student_id, sender, sender_id, sender_name, body, attachments) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sender, sender_name, body, created_at, read_at, attachments`,
        [studentId, from.sender, from.id, from.name, text, JSON.stringify(attachments)],
      )
    : await query<Row>(
        `INSERT INTO messages (student_id, sender, sender_id, sender_name, body) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sender, sender_name, body, created_at, read_at`,
        [studentId, from.sender, from.id, from.name, text],
      );
  return toMessage(row);
}

// 선생님이 보낼 파일 저장 → 첨부 정보 (메시지를 보내기 전에)
export async function saveMessageFile(studentId: string, file: File): Promise<Attachment> {
  if (file.size === 0) throw new Error("빈 파일이에요.");
  if (file.size > MAX_FILE_BYTES) throw new Error("파일은 4MB 까지 보낼 수 있어요. 큰 영상은 유튜브·드라이브 링크로 보내 주세요.");
  const name = (file.name || "파일").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "파일";
  const mime = (file.type || "application/octet-stream").slice(0, 100);
  const id = `mf_${randomBytes(9).toString("hex")}`;
  const token = randomBytes(16).toString("hex");
  try {
    await query(`INSERT INTO message_files (id, token, student_id, name, mime, size, data) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      id,
      token,
      studentId,
      name,
      mime,
      file.size,
      Buffer.from(await file.arrayBuffer()),
    ]);
  } catch (e) {
    if (/message_files/.test((e as Error).message)) throw new Error("파일 보내기 테이블이 아직 없어요. npm run db:setup 을 실행해 주세요.");
    throw e;
  }
  return { kind: "file", id, name, mime, size: file.size, url: `/api/message-files/${id}?t=${token}` };
}

export async function readMessageFile(id: string) {
  if (!/^mf_[0-9a-f]{18}$/.test(id)) return null;
  const rows = await query<{ token: string; student_id: string; name: string; mime: string; data: Buffer }>(
    `SELECT token, student_id, name, mime, data FROM message_files WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// reader 가 대화를 열면 상대가 보낸 안 읽은 메시지를 읽음으로
export async function markRead(studentId: string, reader: Sender) {
  await query(`UPDATE messages SET read_at = now() WHERE student_id = $1 AND sender <> $2 AND read_at IS NULL`, [studentId, reader]);
}

// 학생: 선생님이 보낸 안 읽은 메시지 수
export async function studentUnread(studentId: string): Promise<number> {
  const [r] = await query<{ n: string }>(
    `SELECT count(*) AS n FROM messages WHERE student_id = $1 AND sender = 'teacher' AND read_at IS NULL`,
    [studentId],
  );
  return Number(r.n);
}

// 선생님: 지금 담당 반 학생들과의 대화 목록 (학생별, 최근 순, 안 읽은 수 포함). 다 읽은 대화도 다시 찾아 볼 수 있게 남긴다
export async function teacherInbox(teacherId: string) {
  const rows = await query<{ student_id: string; name: string; n: string; last_body: string; last_sender: Sender; last_at: Date }>(
    `SELECT m.student_id, s.name,
            count(*) FILTER (WHERE m.sender = 'student' AND m.read_at IS NULL) AS n,
            (array_agg(m.body ORDER BY m.id DESC))[1] AS last_body,
            (array_agg(m.sender ORDER BY m.id DESC))[1] AS last_sender,
            max(m.created_at) AS last_at
       FROM messages m
       JOIN students s ON s.id = m.student_id
      WHERE EXISTS (
          SELECT 1 FROM class_members cm
            JOIN classes c ON c.id = cm.class_id AND NOT c.archived
            JOIN teacher_classes t ON t.class_id = cm.class_id AND t.teacher_id = $1
           WHERE cm.student_id = m.student_id AND cm.status = 'active')
      GROUP BY m.student_id, s.name
      ORDER BY max(m.created_at) DESC
      LIMIT 50`,
    [teacherId],
  );
  return rows.map((r) => ({
    studentId: r.student_id,
    name: r.name,
    unread: Number(r.n),
    lastBody: r.last_body,
    lastFromTeacher: r.last_sender === "teacher",
    lastAt: r.last_at.getTime(),
  }));
}

// 선생님이 먼저 메시지를 보낼 수 있는 학생: 지금 담당 반(보관 안 된 반)에 소속된 학생 (반·번호 순)
export async function teacherStudents(teacherId: string) {
  return query<{ id: string; name: string; number: number | null; className: string }>(
    `SELECT DISTINCT ON (c.school_year, c.grade, c.name, m.number, s.id) s.id, s.name, m.number, c.name AS "className"
       FROM class_members m
       JOIN classes c ON c.id = m.class_id AND NOT c.archived
       JOIN teacher_classes t ON t.class_id = m.class_id AND t.teacher_id = $1
       JOIN students s ON s.id = m.student_id
      WHERE m.status = 'active'
      ORDER BY c.school_year DESC, c.grade, c.name, m.number NULLS LAST, s.id`,
    [teacherId],
  );
}

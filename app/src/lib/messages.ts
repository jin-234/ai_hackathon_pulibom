import { query } from "./db";

// 학생 ↔ 선생님 메시지 (DB: messages). 학생 한 명당 대화방 하나
export type Sender = "student" | "teacher";
export type Message = { id: number; sender: Sender; senderName: string; body: string; createdAt: number; readAt: number | null };

type Row = { id: string; sender: Sender; sender_name: string; body: string; created_at: Date; read_at: Date | null };
const toMessage = (r: Row): Message => ({
  id: Number(r.id),
  sender: r.sender,
  senderName: r.sender_name,
  body: r.body,
  createdAt: r.created_at.getTime(),
  readAt: r.read_at ? r.read_at.getTime() : null,
});

export const MAX_BODY = 1000;

// 대화 (오래된 것부터, 최근 200개)
export async function listMessages(studentId: string): Promise<Message[]> {
  const rows = await query<Row>(
    `SELECT * FROM (
       SELECT id, sender, sender_name, body, created_at, read_at FROM messages WHERE student_id = $1 ORDER BY id DESC LIMIT 200
     ) m ORDER BY id`,
    [studentId],
  );
  return rows.map(toMessage);
}

export async function sendMessage(studentId: string, from: { sender: Sender; id: string; name: string }, body: string): Promise<Message> {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) throw new Error("메시지를 입력해 주세요.");
  const [row] = await query<Row>(
    `INSERT INTO messages (student_id, sender, sender_id, sender_name, body) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, sender, sender_name, body, created_at, read_at`,
    [studentId, from.sender, from.id, from.name, text],
  );
  return toMessage(row);
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

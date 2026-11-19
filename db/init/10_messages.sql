-- 학생 ↔ 선생님 메시지 (학생 한 명당 대화방 하나. 그 학생의 지금 담당 선생님들이 함께 본다)
--   read_at: 상대가 읽은 시각 (학생이 보낸 건 선생님이, 선생님이 보낸 건 학생이 읽으면 채운다). 다시 실행해도 안전
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL CHECK (sender IN ('student', 'teacher')),
  sender_id   TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_student_idx ON messages (student_id, id);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

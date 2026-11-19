-- 메시지 첨부: 선생님이 학생에게 개념 영상 링크·학습 자료 파일을 보낸다. 다시 실행해도 안전 (IF NOT EXISTS)
--   messages.attachments: [{ kind: 'link', url, youtubeId? } | { kind: 'file', id, name, mime, size, url }]
--   message_files: 보낸 파일 (4MB 이하, Vercel 요청 크기 한도 4.5MB 안). token 은 추측할 수 없는 값으로,
--                  아이패드 앱이 로그인 쿠키 없이 Safari 로 열 때 /api/message-files/<id>?t=<token> 으로 받는다
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE TABLE IF NOT EXISTS message_files (
  id         TEXT PRIMARY KEY,                  -- mf_xxxxxxxx
  token      TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INT NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_files_student_idx ON message_files (student_id);
ALTER TABLE message_files ENABLE ROW LEVEL SECURITY;

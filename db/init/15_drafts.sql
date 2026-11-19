-- 풀던 중인 풀이 (제출 전): 정리 풀이·연습장·답안 칸을 서버에도 자동 저장해서 다른 기기에서도 이어 쓴다
-- 학생·문항마다 한 줄, 제출하면 지운다. 다시 실행해도 안전
CREATE TABLE IF NOT EXISTS drafts (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL,
  strokes    JSONB,
  scratch    JSONB,
  answer     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, problem_id)
);
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

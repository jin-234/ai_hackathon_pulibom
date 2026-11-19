-- 문항 그림: 설계도(평면도형·좌표·그래프·입체도형) 또는 선생님이 올린 이미지 (app/src/lib/figure.ts)
-- 다시 실행해도 안전 (IF NOT EXISTS)
ALTER TABLE problems ADD COLUMN IF NOT EXISTS figure JSONB;

-- 선생님이 올린 문제 그림 파일 (작은 이미지라 DB 에 바로 저장. 올릴 때 브라우저에서 1600px 이하로 줄인다)
CREATE TABLE IF NOT EXISTS problem_images (
  id         TEXT PRIMARY KEY,                     -- img_xxxxxxxx
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  mime       TEXT NOT NULL,                        -- image/png | image/jpeg | image/webp
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE problem_images ENABLE ROW LEVEL SECURITY;

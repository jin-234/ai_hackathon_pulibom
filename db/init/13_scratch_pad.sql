-- 연습장: 학생이 그림·계산을 한 연습장 필기 (AI 는 읽지 않고, 선생님만 본다). 다시 실행해도 안전
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS scratch_strokes JSONB;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS scratch_image BYTEA;

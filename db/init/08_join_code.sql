-- 반 코드로 회원가입: 학생이 가입할 때 반 코드를 넣으면 그 반 학생이 된다 (교사 승인 없이 바로)
-- 다시 실행해도 안전 (IF NOT EXISTS / 코드가 없는 반만 채움)

ALTER TABLE classes ADD COLUMN IF NOT EXISTS join_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS classes_join_code_idx ON classes (join_code);

-- 코드가 없는 반에 6자리 코드 (헷갈리는 0·O·1·I·L 은 뺀 글자)
--   length(id) * 0 : 반마다 따로 계산되게 하는 장치 (없으면 모든 반이 같은 코드를 받아 중복 오류)
UPDATE classes SET join_code = (
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
    FROM generate_series(1, 6 + (length(id) * 0))
) WHERE join_code IS NULL;

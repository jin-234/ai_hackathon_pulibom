-- 풀이봄 DB 테이블: 과제·문항·풀이·AI 결과
-- 다시 실행해도 안전 (IF NOT EXISTS)

-- 과제 (반 전체 또는 특정 학생에게 배정)
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  published   BOOLEAN NOT NULL DEFAULT false,      -- 학생에게 공개
  closed_at   TIMESTAMPTZ,                         -- 교사가 직접 마감한 시각
  due_at      TIMESTAMPTZ,                         -- 예약된 마감 시각
  student_ids TEXT[],                              -- 정해진 학생에게만 (NULL 이면 반 전체)
  supplement  JSONB,                               -- 보충 과제 정보 (근거 풀이, 목표 오류, AI 변화 분석)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 문항
CREATE TABLE IF NOT EXISTS problems (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  position      INT  NOT NULL,
  title         TEXT NOT NULL,
  question      TEXT NOT NULL,
  free          BOOLEAN NOT NULL DEFAULT false,    -- 일차방정식 풀이기로 못 푸는 자유 문항
  answer        TEXT NOT NULL DEFAULT '',
  concept       TEXT NOT NULL DEFAULT '',
  solution      TEXT[] NOT NULL DEFAULT '{}'       -- 단계별 해설
);
CREATE INDEX IF NOT EXISTS problems_assignment_idx ON problems (assignment_id, position);

-- 학생 풀이 (풀이 이미지 PNG 도 DB에 저장 → 어느 컴퓨터에서나 같은 풀이가 보임)
-- 문항이 지워져도 기록은 남도록 problem_id 는 외래키 없이 + 제출 당시 문항 식(question) 저장
CREATE TABLE IF NOT EXISTS submissions (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  problem_id     TEXT NOT NULL,
  question       TEXT,
  started_at     TIMESTAMPTZ NOT NULL,
  submitted_at   TIMESTAMPTZ NOT NULL,
  strokes        JSONB NOT NULL DEFAULT '[]',       -- 필기 획 (좌표·시간)
  events         JSONB NOT NULL DEFAULT '[]',       -- 입력·삭제·화면 이탈 기록
  image          BYTEA,                             -- 풀이 이미지 (PNG)
  ocr_lines      TEXT[] NOT NULL DEFAULT '{}',
  ocr_raw        JSONB,
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | done | needs_review | error
  status_message TEXT,
  analysis       JSONB,                             -- AI 분석 결과
  teacher        JSONB,                             -- 교사 확인·수정·메모
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_student_idx ON submissions (student_id, submitted_at);
CREATE INDEX IF NOT EXISTS submissions_problem_idx ON submissions (problem_id);

-- 학생별 AI 학습 요약 (가장 최근 1개)
CREATE TABLE IF NOT EXISTS student_summaries (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

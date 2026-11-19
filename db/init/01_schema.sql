-- 풀이봄 DB 테이블: 학급·교사·학생
-- npm run db:setup 으로 실행 (다시 실행해도 안전: IF NOT EXISTS)
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- 비밀번호 해시 (crypt)

-- 학급
CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,                -- 예: c1-3
  school_year INT  NOT NULL,                   -- 학년도
  grade       INT  NOT NULL,                   -- 학년
  name        TEXT NOT NULL,                   -- 예: 1학년 3반
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 교사
CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY,              -- 로그인 아이디
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- crypt(비밀번호, gen_salt('bf'))
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 교사 ↔ 담당 학급 (학급별 접근 권한)
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

-- 학생
-- ⚠ 식별정보(이름)는 이 테이블에만 둔다. 풀이·AI 분석 데이터는 학생 id 로만 연결하고, 외부 AI 에는 id·이름을 보내지 않는다.
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,              -- 예: s01
  class_id      TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  number        INT  NOT NULL,                 -- 번호
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- 숫자 4자리 PIN 해시
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, number)
);

CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id, number);

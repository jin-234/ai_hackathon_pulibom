-- 반 여러 개 + 학년도별 반 소속 이력
-- 학생 계정(students)은 졸업할 때까지 그대로, 반 소속(class_members)만 해마다 새로 생긴다.
-- 다시 실행해도 안전 (IF NOT EXISTS / ON CONFLICT)

-- 학년이 끝난 반은 지우지 않고 보관 (학생 화면에서 사라지고, 교사 화면에서는 '지난 반'으로 읽기 전용)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- 학생 ↔ 반 소속 이력 (한 학생이 학년마다 다른 반에 속한다)
CREATE TABLE IF NOT EXISTS class_members (
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  number     INT,                                -- 그 반에서의 번호
  status     TEXT NOT NULL DEFAULT 'active',     -- pending(승인 대기) | active | left(전학·탈퇴)
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at    TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS class_members_student_idx ON class_members (student_id);

-- 기존 데이터 옮기기: students.class_id → class_members (이미 있으면 건너뜀)
INSERT INTO class_members (class_id, student_id, number, joined_at)
SELECT class_id, id, number, created_at FROM students WHERE class_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- students.class_id 는 '지금 반'을 가리키는 예전 칸 (이전 버전 코드 호환용). 반 정보는 class_members 를 기준으로 한다
ALTER TABLE students ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

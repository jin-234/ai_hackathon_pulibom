-- Supabase 는 public 스키마 테이블을 웹 API(Data API)로 자동 공개한다.
-- 앱은 DATABASE_URL 로 직접 접속하므로 웹 API 는 쓰지 않는다 → RLS 를 켜고 정책을 두지 않아 웹 API 접근을 막는다.
-- (테이블 주인인 postgres 계정으로 접속하는 앱에는 영향 없음)
ALTER TABLE classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_classes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_summaries ENABLE ROW LEVEL SECURITY;

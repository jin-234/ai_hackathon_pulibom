-- 고1 반 (교육과정 학년 번호 4 = 고1, app/src/lib/curriculum.ts 참고)
-- 시연용 기본 데이터 (실제 학생 정보 아님). 선생님 teacher / 1234 가 함께 담당, 학생: 번호 선택 + 0000
-- 다시 실행해도 안전 (ON CONFLICT)
INSERT INTO classes (id, school_year, grade, name) VALUES ('h1-1', 2026, 4, '고1 1반') ON CONFLICT DO NOTHING;
INSERT INTO teacher_classes (teacher_id, class_id) VALUES ('teacher', 'h1-1') ON CONFLICT DO NOTHING;

INSERT INTO students (id, class_id, number, name, password_hash)
SELECT 'h' || lpad(n::text, 2, '0'), 'h1-1', n, name, crypt('0000', gen_salt('bf'))
FROM unnest(ARRAY['서○○','문○○','신○○','권○○']) WITH ORDINALITY AS t(name, n)
ON CONFLICT DO NOTHING;

INSERT INTO class_members (class_id, student_id, number)
SELECT 'h1-1', id, number FROM students WHERE class_id = 'h1-1'
ON CONFLICT DO NOTHING;

-- 반 코드 (08_join_code.sql 이 이 파일보다 먼저 돌아서, 처음 만들 때는 여기서 채운다)
UPDATE classes SET join_code = (
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
    FROM generate_series(1, 6 + (length(id) * 0))
) WHERE id = 'h1-1' AND join_code IS NULL;

-- 시연용 기본 데이터 (실제 학생 정보 아님)
-- 선생님: teacher / 1234,  학생: 번호 선택 + 0000
INSERT INTO classes (id, school_year, grade, name) VALUES ('c1-3', 2026, 1, '1학년 3반') ON CONFLICT DO NOTHING;

INSERT INTO teachers (id, name, password_hash) VALUES ('teacher', '김선생님', crypt('1234', gen_salt('bf'))) ON CONFLICT DO NOTHING;
INSERT INTO teacher_classes (teacher_id, class_id) VALUES ('teacher', 'c1-3') ON CONFLICT DO NOTHING;

INSERT INTO students (id, class_id, number, name, password_hash)
SELECT 's' || lpad(n::text, 2, '0'), 'c1-3', n, name, crypt('0000', gen_salt('bf'))
FROM unnest(ARRAY['김○○','이○○','박○○','최○○','정○○','강○○','조○○','윤○○','장○○','임○○','한○○','오○○'])
     WITH ORDINALITY AS t(name, n)
ON CONFLICT DO NOTHING;

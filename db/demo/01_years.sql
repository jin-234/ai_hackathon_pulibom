-- 시연용: 학년이 바뀌어도 기록이 이어지는 예시 (실제 학생 정보 아님, AI 결과도 직접 만든 예시)
--   2025학년도 1학년 1반 (김선생님, 보관됨) → 2026학년도 2학년 1반 (박선생님)
--   같은 학생 3명이 두 반에 모두 속해 있다. 새 담임 박선생님은 이 학생들의 작년 기록까지 볼 수 있다.
-- 선생님: teacher2 / 1234 (박선생님),  학생: 2학년 1반 번호 선택 + 0000
-- npm run db:demo 로 넣는다 (db:setup 에는 포함되지 않음)

INSERT INTO classes (id, school_year, grade, name, archived) VALUES
  ('c25-1-1', 2025, 1, '1학년 1반', true),
  ('c2-1',    2026, 2, '2학년 1반', false)
ON CONFLICT DO NOTHING;

INSERT INTO teachers (id, name, password_hash) VALUES ('teacher2', '박선생님', crypt('1234', gen_salt('bf'))) ON CONFLICT DO NOTHING;
INSERT INTO teacher_classes (teacher_id, class_id) VALUES ('teacher', 'c25-1-1'), ('teacher2', 'c2-1') ON CONFLICT DO NOTHING;

-- students.class_id 는 지금 반 (예전 칸)
INSERT INTO students (id, class_id, number, name, password_hash, created_at)
SELECT id, 'c2-1', n, name, crypt('0000', gen_salt('bf')), '2025-03-02 09:00+09'
FROM (VALUES ('s13', 1, '서○○'), ('s14', 2, '문○○'), ('s15', 3, '배○○')) AS t(id, n, name)
ON CONFLICT DO NOTHING;

INSERT INTO class_members (class_id, student_id, number, joined_at) VALUES
  ('c25-1-1', 's13', 7,  '2025-03-02 09:00+09'),
  ('c25-1-1', 's14', 12, '2025-03-02 09:00+09'),
  ('c25-1-1', 's15', 20, '2025-03-02 09:00+09'),
  ('c2-1',    's13', 1,  '2026-03-02 09:00+09'),
  ('c2-1',    's14', 2,  '2026-03-02 09:00+09'),
  ('c2-1',    's15', 3,  '2026-03-02 09:00+09')
ON CONFLICT DO NOTHING;

-- 과제: 작년(마감됨) / 올해
INSERT INTO assignments (id, class_id, title, published, closed_at, created_at) VALUES
  ('a25-1',   'c25-1-1', '수학 1-1 · 일차방정식', true, '2025-07-10 18:00+09', '2025-07-01 09:00+09'),
  ('a26-2-1', 'c2-1',    '2학년 첫 진단 · 일차방정식 복습', true, NULL, '2026-03-05 09:00+09')
ON CONFLICT DO NOTHING;

INSERT INTO problems (id, assignment_id, position, title, question, answer, concept, solution) VALUES
  ('a25-1-p1',   'a25-1',   1, '1번 문항', '2x + 3 = 11',     'x=4', '등식의 성질·이항', ARRAY['2x + 3 = 11', '2x = 11 - 3', '2x = 8', 'x = 4']),
  ('a25-1-p2',   'a25-1',   2, '2번 문항', '5x - 7 = 3',      'x=2', '이항·정수 계산',   ARRAY['5x - 7 = 3', '5x = 3 + 7', '5x = 10', 'x = 2']),
  ('a25-1-p3',   'a25-1',   3, '3번 문항', '4x - 5 = 2x + 7', 'x=6', '동류항 정리·이항', ARRAY['4x - 5 = 2x + 7', '4x - 2x = 7 + 5', '2x = 12', 'x = 6']),
  ('a26-2-1-p1', 'a26-2-1', 1, '1번 문항', '3x + 6 = 15',     'x=3', '등식의 성질·이항', ARRAY['3x + 6 = 15', '3x = 15 - 6', '3x = 9', 'x = 3']),
  ('a26-2-1-p2', 'a26-2-1', 2, '2번 문항', '7 - 2x = 1',      'x=3', '이항·정수 계산',   ARRAY['7 - 2x = 1', '-2x = 1 - 7', '-2x = -6', 'x = 3']),
  ('a26-2-1-p3', 'a26-2-1', 3, '3번 문항', '3(x - 2) = x + 4', 'x=5', '괄호 풀기·동류항 정리', ARRAY['3(x - 2) = x + 4', '3x - 6 = x + 4', '2x = 10', 'x = 5'])
ON CONFLICT DO NOTHING;

-- 풀이 (이미지 없음, AI 결과는 예시. model = '시연용 예시')
INSERT INTO submissions (id, student_id, problem_id, question, started_at, submitted_at, ocr_lines, status, analysis, teacher) VALUES
  -- 서○○: 작년부터 이항할 때 부호를 바꾸지 않는 오류가 반복
  ('demo25-s13-p1', 's13', 'a25-1-p1', '2x + 3 = 11', '2025-07-03 10:00+09', '2025-07-03 10:03+09',
   ARRAY['2x+3=11', '2x=11+3', '2x=14', 'x=7'], 'done',
   '{"correctedLines":["2x+3=11","2x=11+3","2x=14","x=7"],"recognizedAnswer":"x=7","correct":false,"firstErrorLine":1,"errorType":"TRANSPOSE","concept":"등식의 성질·이항","reason":"+3을 우변으로 옮기면서 부호를 바꾸지 않았어요 (2x = 11 + 3).","suggestion":"양변에서 3을 빼는 과정으로 이항의 의미를 다시 확인해 주세요.","needsReview":false,"model":"시연용 예시"}',
   '{"memo":"이항할 때 부호를 그대로 둠. 양변에서 같은 수를 빼는 과정으로 다시 설명함.","confirmedAt":1751612400000,"by":"teacher"}'),
  ('demo25-s13-p2', 's13', 'a25-1-p2', '5x - 7 = 3', '2025-07-03 10:04+09', '2025-07-03 10:08+09',
   ARRAY['5x-7=3', '5x=3-7', '5x=-4', 'x=-4/5'], 'done',
   '{"correctedLines":["5x-7=3","5x=3-7","5x=-4","x=-4/5"],"recognizedAnswer":"x=-4/5","correct":false,"firstErrorLine":1,"errorType":"TRANSPOSE","concept":"이항·정수 계산","reason":"-7을 우변으로 옮기면서 부호를 바꾸지 않았어요 (5x = 3 - 7).","suggestion":"이항하면 부호가 바뀌는 이유를 등식의 성질로 짚어 주세요.","needsReview":false,"model":"시연용 예시"}',
   NULL),
  ('demo25-s13-p3', 's13', 'a25-1-p3', '4x - 5 = 2x + 7', '2025-07-03 10:09+09', '2025-07-03 10:15+09',
   ARRAY['4x-5=2x+7', '4x+2x=7-5', '6x=2', 'x=1/3'], 'done',
   '{"correctedLines":["4x-5=2x+7","4x+2x=7-5","6x=2","x=1/3"],"recognizedAnswer":"x=1/3","correct":false,"firstErrorLine":1,"errorType":"TRANSPOSE","concept":"동류항 정리·이항","reason":"2x와 -5를 옮기면서 둘 다 부호를 바꾸지 않았어요.","suggestion":"좌변·우변으로 옮길 항에 표시하고 부호를 바꾸는 연습을 권해요.","needsReview":false,"model":"시연용 예시"}',
   NULL),
  -- 문○○: 정수 계산 실수 한 번
  ('demo25-s14-p1', 's14', 'a25-1-p1', '2x + 3 = 11', '2025-07-03 10:00+09', '2025-07-03 10:02+09',
   ARRAY['2x+3=11', '2x=8', 'x=4'], 'done',
   '{"correctedLines":["2x+3=11","2x=8","x=4"],"recognizedAnswer":"x=4","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"이항과 나눗셈이 모두 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}',
   NULL),
  ('demo25-s14-p2', 's14', 'a25-1-p2', '5x - 7 = 3', '2025-07-03 10:03+09', '2025-07-03 10:06+09',
   ARRAY['5x-7=3', '5x=3+7', '5x=-10', 'x=-2'], 'done',
   '{"correctedLines":["5x-7=3","5x=3+7","5x=-10","x=-2"],"recognizedAnswer":"x=-2","correct":false,"firstErrorLine":2,"errorType":"SIGN","concept":"이항·정수 계산","reason":"이항은 맞았지만 3 + 7을 -10으로 계산했어요.","suggestion":"정수 덧셈에서 부호를 정하는 순서를 다시 확인해 주세요.","needsReview":false,"model":"시연용 예시"}',
   NULL),
  ('demo25-s14-p3', 's14', 'a25-1-p3', '4x - 5 = 2x + 7', '2025-07-03 10:07+09', '2025-07-03 10:12+09',
   ARRAY['4x-5=2x+7', '4x-2x=7+5', '2x=12', 'x=6'], 'done',
   '{"correctedLines":["4x-5=2x+7","4x-2x=7+5","2x=12","x=6"],"recognizedAnswer":"x=6","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"동류항 정리·이항","reason":"이항과 동류항 정리가 모두 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}',
   NULL),
  -- 배○○: 모두 정답
  ('demo25-s15-p1', 's15', 'a25-1-p1', '2x + 3 = 11', '2025-07-03 10:00+09', '2025-07-03 10:02+09',
   ARRAY['2x+3=11', '2x=11-3', '2x=8', 'x=4'], 'done',
   '{"correctedLines":["2x+3=11","2x=11-3","2x=8","x=4"],"recognizedAnswer":"x=4","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"풀이 과정이 모두 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}',
   NULL),
  ('demo25-s15-p2', 's15', 'a25-1-p2', '5x - 7 = 3', '2025-07-03 10:03+09', '2025-07-03 10:05+09',
   ARRAY['5x-7=3', '5x=3+7', '5x=10', 'x=2'], 'done',
   '{"correctedLines":["5x-7=3","5x=3+7","5x=10","x=2"],"recognizedAnswer":"x=2","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"이항·정수 계산","reason":"풀이 과정이 모두 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}',
   NULL),
  -- 올해: 서○○가 2학년 첫 진단에서도 같은 이항 오류
  ('demo26-s13-p2', 's13', 'a26-2-1-p2', '7 - 2x = 1', '2026-03-05 10:00+09', '2026-03-05 10:04+09',
   ARRAY['7-2x=1', '-2x=1+7', '-2x=8', 'x=-4'], 'done',
   '{"correctedLines":["7-2x=1","-2x=1+7","-2x=8","x=-4"],"recognizedAnswer":"x=-4","correct":false,"firstErrorLine":1,"errorType":"TRANSPOSE","concept":"이항·정수 계산","reason":"7을 우변으로 옮기면서 부호를 바꾸지 않았어요 (-2x = 1 + 7).","suggestion":"작년 기록에서도 같은 이항 오류가 있었어요. 등식의 성질로 이항을 다시 확인해 주세요.","needsReview":false,"model":"시연용 예시"}',
   NULL),
  -- 문○○도 올해 같은 이항 오류 → 서○○과 '등식 변형·이항' 소그룹으로 묶인다
  ('demo26-s14-p1', 's14', 'a26-2-1-p1', '3x + 6 = 15', '2026-03-05 10:00+09', '2026-03-05 10:03+09',
   ARRAY['3x+6=15', '3x=15+6', '3x=21', 'x=7'], 'done',
   '{"correctedLines":["3x+6=15","3x=15+6","3x=21","x=7"],"recognizedAnswer":"x=7","correct":false,"firstErrorLine":1,"errorType":"TRANSPOSE","concept":"등식의 성질·이항","reason":"+6을 우변으로 옮기면서 부호를 바꾸지 않았어요 (3x = 15 + 6).","suggestion":"양변에서 6을 빼는 과정으로 이항의 의미를 확인해 주세요.","needsReview":false,"model":"시연용 예시"}',
   NULL)
ON CONFLICT DO NOTHING;

-- 시연용: 반복 학습 순환 (실제 학생 아님, AI 결과도 직접 만든 예시)
--   s02(1학년 3반): 이항 오류 2번 (02_class13_groups.sql) → 문제은행 보충 5문항을 모두 맞힘 (극복·익힘 기준: 4번 연속) → 그 뒤 동류항 오류 1번
--   → 다음 보충을 만들면: 이항은 '극복한 오류'라 건너뛰고 동류항이 목표, 이미 익힌 'ax + b = c' 틀은 맨 뒤로
-- npm run db:demo 로 넣는다. 다시 실행해도 안전 (ON CONFLICT DO NOTHING)

INSERT INTO assignments (id, class_id, title, published, closed_at, created_at, student_ids, supplement) VALUES
  ('demo-sup-s02', 'c1-3', '보충 · 등식의 성질·이항', true, '2026-11-14 18:00+09', '2026-11-13 15:00+09', ARRAY['s02'],
   '{"studentId":"s02","concept":"등식의 성질·이항","targetError":"TRANSPOSE","sourceSubmissionIds":["demo-c13-s02-p1","demo-c13-s02-p2"],
     "review":{"generatedAt":1794643200000,"model":"시연용 예시","verdict":"개선","summary":"보충 전에는 2x + 3 = 11 → 2x = 11 + 3 처럼 부호를 그대로 두었는데, 보충 5문항에서는 모두 부호를 바꿔 옮겼어요.","remaining":[],"nextStep":"이항은 다음 단계(양변에 x 가 있는 식)로 넘어가도 좋아요."}}')
ON CONFLICT DO NOTHING;

INSERT INTO problems (id, assignment_id, position, title, question, answer, concept, solution, template_id) VALUES
  ('demo-sup-s02-p1', 'demo-sup-s02', 1, '1번 문항', '3x + 4 = 19', 'x=5', '등식의 성질·이항', ARRAY['3x + 4 = 19', '3x = 19 - 4', '3x = 15', 'x = 5'], 't-ax-b-c'),
  ('demo-sup-s02-p2', 'demo-sup-s02', 2, '2번 문항', '4x + 7 = 31', 'x=6', '등식의 성질·이항', ARRAY['4x + 7 = 31', '4x = 31 - 7', '4x = 24', 'x = 6'], 't-ax-b-c'),
  ('demo-sup-s02-p3', 'demo-sup-s02', 3, '3번 문항', '6x - 5 = 13', 'x=3', '이항·정수 계산',   ARRAY['6x - 5 = 13', '6x = 13 + 5', '6x = 18', 'x = 3'], 't-ax-minus-b-c'),
  ('demo-sup-s02-p4', 'demo-sup-s02', 4, '4번 문항', '2x + 5 = 17', 'x=6', '등식의 성질·이항', ARRAY['2x + 5 = 17', '2x = 17 - 5', '2x = 12', 'x = 6'], 't-ax-b-c'),
  ('demo-sup-s02-p5', 'demo-sup-s02', 5, '5번 문항', '5x + 3 = 28', 'x=5', '등식의 성질·이항', ARRAY['5x + 3 = 28', '5x = 28 - 3', '5x = 25', 'x = 5'], 't-ax-b-c')
ON CONFLICT DO NOTHING;

INSERT INTO submissions (id, student_id, problem_id, question, started_at, submitted_at, ocr_lines, status, analysis) VALUES
  ('demo-sup-s02-a1', 's02', 'demo-sup-s02-p1', '3x + 4 = 19', '2026-11-14 09:00+09', '2026-11-14 09:02+09',
   ARRAY['3x+4=19', '3x=19-4', '3x=15', 'x=5'], 'done',
   '{"correctedLines":["3x+4=19","3x=19-4","3x=15","x=5"],"recognizedAnswer":"x=5","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"+4를 옮기면서 부호를 바꿔 바르게 풀었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}'),
  ('demo-sup-s02-a2', 's02', 'demo-sup-s02-p2', '4x + 7 = 31', '2026-11-14 09:03+09', '2026-11-14 09:05+09',
   ARRAY['4x+7=31', '4x=31-7', '4x=24', 'x=6'], 'done',
   '{"correctedLines":["4x+7=31","4x=31-7","4x=24","x=6"],"recognizedAnswer":"x=6","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"풀이가 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}'),
  ('demo-sup-s02-a3', 's02', 'demo-sup-s02-p3', '6x - 5 = 13', '2026-11-14 09:06+09', '2026-11-14 09:09+09',
   ARRAY['6x-5=13', '6x=13+5', '6x=18', 'x=3'], 'done',
   '{"correctedLines":["6x-5=13","6x=13+5","6x=18","x=3"],"recognizedAnswer":"x=3","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"이항·정수 계산","reason":"-5를 옮기면서 부호를 바꿔 바르게 풀었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}'),
  ('demo-sup-s02-a4', 's02', 'demo-sup-s02-p4', '2x + 5 = 17', '2026-11-14 09:10+09', '2026-11-14 09:12+09',
   ARRAY['2x+5=17', '2x=17-5', '2x=12', 'x=6'], 'done',
   '{"correctedLines":["2x+5=17","2x=17-5","2x=12","x=6"],"recognizedAnswer":"x=6","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"+5를 옮기면서 부호를 바꿔 바르게 풀었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}'),
  ('demo-sup-s02-a5', 's02', 'demo-sup-s02-p5', '5x + 3 = 28', '2026-11-14 09:13+09', '2026-11-14 09:15+09',
   ARRAY['5x+3=28', '5x=28-3', '5x=25', 'x=5'], 'done',
   '{"correctedLines":["5x+3=28","5x=28-3","5x=25","x=5"],"recognizedAnswer":"x=5","correct":true,"firstErrorLine":null,"errorType":"NONE","concept":"등식의 성질·이항","reason":"풀이가 바르게 되었어요.","suggestion":"","needsReview":false,"model":"시연용 예시"}'),
  -- 그 뒤 양변에 x 가 있는 문항: 이항은 맞게 했지만 동류항 계산에서 틀림
  ('demo-c13-s02-p4', 's02', 'p4', '4x - 5 = 2x + 7', '2026-11-14 10:00+09', '2026-11-14 10:03+09',
   ARRAY['4x-5=2x+7', '4x-2x=7+5', '6x=12', 'x=2'], 'done',
   '{"correctedLines":["4x-5=2x+7","4x-2x=7+5","6x=12","x=2"],"recognizedAnswer":"x=2","correct":false,"firstErrorLine":2,"errorType":"LIKE_TERMS","concept":"동류항 정리·이항","reason":"이항은 바르게 했지만 4x - 2x를 6x로 계산했어요.","suggestion":"계수끼리 빼는 과정을 다시 확인해 주세요.","needsReview":false,"model":"시연용 예시"}')
ON CONFLICT DO NOTHING;

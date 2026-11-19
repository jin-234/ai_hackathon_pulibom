-- 풀이봄 시연용 가상 데이터 (모든 이름·기록은 가상)
-- 다시 넣고 싶으면 맨 아래 주석의 삭제문 먼저 실행

insert into classes (id, name) values ('c01', '1학년 3반') on conflict do nothing;

insert into students (id, class_id, number, name) values
  ('s01', 'c01', 1, '김민준'),
  ('s02', 'c01', 2, '이서연'),
  ('s03', 'c01', 3, '박지호'),
  ('s04', 'c01', 4, '최하은'),
  ('s05', 'c01', 5, '정도윤'),
  ('s06', 'c01', 6, '강수아')
on conflict do nothing;

insert into problems (id, concept, content, answer, solution, difficulty) values
  ('p01', 'transposition', '3x + 6 = 15',             '3',  '3x = 15 - 6 → 3x = 9 → x = 3', 1),
  ('p02', 'transposition', '2x + 3 = 11',             '4',  '2x = 11 - 3 → 2x = 8 → x = 4', 1),
  ('p03', 'like_terms',    '5x - 7 = 2x + 8',         '5',  '5x - 2x = 8 + 7 → 3x = 15 → x = 5', 2),
  ('p04', 'like_terms',    '4x - 3 = -x + 12',        '3',  '4x + x = 12 + 3 → 5x = 15 → x = 3', 2),
  ('p05', 'distribution',  '2(x - 3) = x + 4',        '10', '2x - 6 = x + 4 → 2x - x = 4 + 6 → x = 10', 2),
  ('p06', 'distribution',  '3(x + 2) - 5 = 2x + 7',   '6',  '3x + 6 - 5 = 2x + 7 → 3x + 1 = 2x + 7 → x = 6', 3),
  ('p07', 'transposition', '-2x + 5 = 13',            '-4', '-2x = 13 - 5 → -2x = 8 → x = -4', 1),
  ('p08', 'fraction_coef', 'x/2 + 1 = 4',             '6',  '양변에 2를 곱함: x + 2 = 8 → x = 6', 2),
  ('p09', 'fraction_coef', '(x + 1)/3 = (x - 1)/2',   '5',  '양변에 6을 곱함: 2(x + 1) = 3(x - 1) → 2x + 2 = 3x - 3 → x = 5', 3),
  ('p10', 'fraction_coef', '0.3x - 0.5 = 0.1x + 0.7', '6',  '양변에 10을 곱함: 3x - 5 = x + 7 → 2x = 12 → x = 6', 3),
  ('p11', 'like_terms',    '7 - 3x = 2x - 8',         '3',  '-3x - 2x = -8 - 7 → -5x = -15 → x = 3', 2),
  ('p12', 'distribution',  '-4(x - 1) = 2x - 8',      '2',  '-4x + 4 = 2x - 8 → -6x = -12 → x = 2', 3),
  ('p13', 'distribution',  '6x - 2(2x + 1) = 8',      '5',  '6x - 4x - 2 = 8 → 2x = 10 → x = 5', 3),
  ('p14', 'distribution',  '5 - (x - 3) = 2x - 1',    '3',  '5 - x + 3 = 2x - 1 → -3x = -9 → x = 3', 3),
  ('p15', 'fraction_coef', 'x/3 - 1 = x/4',           '12', '양변에 12를 곱함: 4x - 12 = 3x → x = 12', 3)
on conflict do nothing;

insert into assignments (id, class_id, kind, title, created_at) values
  ('a01', 'c01', 'regular', '일차방정식 형성평가 1', now() - interval '3 days'),
  ('a02', 'c01', 'regular', '일차방정식 과제 2',     now() - interval '1 hour')
on conflict do nothing;

insert into assignment_problems (assignment_id, problem_id, position) values
  ('a01', 'p01', 1), ('a01', 'p03', 2), ('a01', 'p05', 3), ('a01', 'p07', 4), ('a01', 'p08', 5), ('a01', 'p11', 6),
  ('a02', 'p02', 1), ('a02', 'p04', 2), ('a02', 'p06', 3), ('a02', 'p09', 4), ('a02', 'p12', 5), ('a02', 'p13', 6)
on conflict do nothing;

-- 과제 1에 대한 가상 제출 기록 (s06은 미제출)
-- (학생, 문항, 최종답, 풀이초, 지운횟수, 오류유형, 처음 오류 단계, 분석 이유)
insert into submissions (
  assignment_id, problem_id, student_id, final_answer, is_correct, duration_sec, stroke_count, erase_count,
  started_at, submitted_at, ocr_engine, status, error_type, concept, analysis, is_demo, created_at
)
select
  'a01', d.pid, d.sid, d.ans,
  d.ans = p.answer,
  d.sec, 8 + (d.sec / 15), d.erase,
  now() - interval '3 days' + (d.ord * interval '3 minutes'),
  now() - interval '3 days' + (d.ord * interval '3 minutes') + (d.sec * interval '1 second'),
  'demo',
  'done',
  d.err,
  case when d.err in ('none', 'other') then null else d.err end,
  jsonb_build_object(
    'steps', '[]'::jsonb,
    'first_error_step', d.step,
    'error_type', d.err,
    'related_concept', case when d.err in ('none', 'other') then p.concept else d.err end,
    'reason', d.reason,
    'suggestion', case when d.err = 'none' then '추가 지도 필요 없음' else '같은 개념의 유사 문항으로 재확인' end,
    'check_question', '',
    'confidence', 0.8,
    'needs_review', false
  ),
  true,
  now() - interval '3 days' + (d.ord * interval '3 minutes')
from (values
  -- 김민준: 이항할 때 부호를 안 바꾸는 오류 반복
  (1,  's01', 'p01', '7',  95,  1, 'transposition', 2, '3x = 15 + 6 으로 이항하면서 +6의 부호를 바꾸지 않음'),
  (2,  's01', 'p03', '1/7', 160, 2, 'transposition', 2, '5x + 2x = 8 - 7 로 양변의 항을 옮기며 부호를 바꾸지 않음'),
  (3,  's01', 'p05', '10', 140, 0, 'none',          0, '분배와 이항 모두 바르게 처리'),
  (4,  's01', 'p07', '-9', 110, 1, 'transposition', 2, '-2x = 13 + 5 로 +5의 부호를 바꾸지 않음'),
  (5,  's01', 'p08', '6',  120, 0, 'none',          0, '분모를 없애는 과정이 바름'),
  (6,  's01', 'p11', '3',  150, 1, 'none',          0, '바르게 풀었으나 중간에 한 번 지우고 다시 씀'),
  -- 이서연: 대부분 정답, 음수 나눗셈 한 번 실수
  (7,  's02', 'p01', '3',  50,  0, 'none',          0, '바르게 풂'),
  (8,  's02', 'p03', '5',  80,  0, 'none',          0, '바르게 풂'),
  (9,  's02', 'p05', '10', 75,  0, 'none',          0, '바르게 풂'),
  (10, 's02', 'p07', '4',  60,  0, 'integer_ops',   3, '-2x = 8 에서 양변을 -2로 나눌 때 부호를 놓침'),
  (11, 's02', 'p08', '6',  70,  0, 'none',          0, '바르게 풂'),
  (12, 's02', 'p11', '3',  85,  0, 'none',          0, '바르게 풂'),
  -- 박지호: 괄호 전개, 분수 계수에서 막힘
  (13, 's03', 'p01', '3',  90,  0, 'none',          0, '바르게 풂'),
  (14, 's03', 'p03', '5',  130, 1, 'none',          0, '바르게 풂'),
  (15, 's03', 'p05', '7',  210, 3, 'distribution',  1, '2(x - 3) 을 2x - 3 으로 전개하여 뒤 항에 2를 곱하지 않음'),
  (16, 's03', 'p07', '-4', 100, 0, 'none',          0, '바르게 풂'),
  (17, 's03', 'p08', '2',  240, 4, 'fraction_coef', 1, '양변에 2를 곱할 때 상수항 1에는 곱하지 않음 (x + 1 = 8)'),
  (18, 's03', 'p11', '3',  170, 2, 'none',          0, '바르게 풂'),
  -- 최하은: 모두 정답이지만 오래 걸림
  (19, 's04', 'p01', '3',  180, 2, 'none',          0, '바르게 풂'),
  (20, 's04', 'p03', '5',  260, 3, 'none',          0, '바르게 풂'),
  (21, 's04', 'p05', '10', 240, 2, 'none',          0, '바르게 풂'),
  (22, 's04', 'p07', '-4', 200, 1, 'none',          0, '바르게 풂'),
  -- 정도윤: 부호·계산 실수 반복
  (23, 's05', 'p01', '3',  70,  0, 'none',          0, '바르게 풂'),
  (24, 's05', 'p03', '15', 95,  1, 'like_terms',    3, '3x = 15 까지 구한 뒤 x 대신 3x 값을 답으로 씀'),
  (25, 's05', 'p05', '10', 120, 0, 'none',          0, '바르게 풂'),
  (26, 's05', 'p07', '4',  65,  0, 'integer_ops',   3, '-2x = 8 에서 x = 4 로 부호를 놓침'),
  (27, 's05', 'p08', '6',  90,  0, 'none',          0, '바르게 풂'),
  (28, 's05', 'p11', '-3', 105, 1, 'integer_ops',   3, '-5x = -15 를 나눌 때 음수 ÷ 음수의 부호를 틀림')
) as d(ord, sid, pid, ans, sec, erase, err, step, reason)
join problems p on p.id = d.pid;

-- 초기화:
-- delete from submissions; delete from teacher_notes; delete from assignment_problems; delete from assignments;
-- delete from problems; delete from students; delete from classes;

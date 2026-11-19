-- 입학 레벨 테스트 (중1 입학): 초등학교 과정을 얼마나 잘 아는지 확인 → 영역별 강점·약점
--   새로 배울 중1 내용을 미리 시험하는 것(선행)이 아니라, 이미 배운 이전 과정의 이해 수준을 본다
--   약했던 개념은 이후 보충 문제에 '이전 과정 복습' 문항으로 조금 섞는다
-- 다시 실행해도 안전. 교사가 고쳤을 수 있는 개념·틀은 덮어쓰지 않는다

-- 개념 지도. stage = 배우는 학년 (초4·초5·초6·중1), area = 영역, prereqs = 먼저 알아야 하는 개념
CREATE TABLE IF NOT EXISTS concepts (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  stage     TEXT NOT NULL,
  position  INT  NOT NULL,              -- 화면 정렬용
  prereqs   TEXT[] NOT NULL DEFAULT '{}',
  errors    TEXT[] NOT NULL DEFAULT '{}' -- 이 개념이 약하면 자주 나오는 오류 유형 (ErrorType)
);
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS area TEXT;

-- 초등 과정(레벨 테스트 범위) + 중1 '문자와 식·일차방정식' (레벨 테스트에는 안 나옴, 보충 틀 연결용)
-- 학년·영역은 2022 개정 교육과정 기준 초안 (수학교사 검토 필요)
-- area 가 비어 있는 행(이전 버전에서 만든 개념)만 새 값으로 바꾼다
INSERT INTO concepts (id, name, stage, area, position, prereqs, errors) VALUES
  ('e-mixed',       '자연수의 혼합 계산',   '초5', '수와 연산',     1,  '{}',                                ARRAY['ARITH', 'DIVIDE']),
  ('e-factor',      '약수와 배수',          '초5', '수와 연산',     2,  '{}',                                ARRAY['FRACTION']),
  ('e-frac-addsub', '분수의 덧셈·뺄셈',     '초5', '수와 연산',     3,  ARRAY['e-factor'],                   ARRAY['FRACTION']),
  ('e-frac-muldiv', '분수의 곱셈·나눗셈',   '초6', '수와 연산',     4,  ARRAY['e-factor'],                   ARRAY['FRACTION', 'DIVIDE']),
  ('e-decimal',     '소수의 곱셈·나눗셈',   '초6', '수와 연산',     5,  ARRAY['e-mixed'],                    ARRAY['ARITH', 'DIVIDE']),
  ('e-box',         '□가 있는 식',          '초4', '변화와 관계',   6,  ARRAY['e-mixed'],                    ARRAY['TRANSPOSE']),
  ('e-pattern',     '규칙과 대응',          '초5', '변화와 관계',   7,  ARRAY['e-mixed'],                    ARRAY['EXPR_MEANING']),
  ('e-ratio',       '비와 비율·백분율',     '초6', '변화와 관계',   8,  ARRAY['e-frac-muldiv'],              ARRAY['FRACTION']),
  ('e-proportion',  '비례식',               '초6', '변화와 관계',   9,  ARRAY['e-frac-muldiv'],              ARRAY['DIVIDE']),
  ('e-area',        '다각형의 넓이',        '초5', '도형과 측정',   10, ARRAY['e-mixed'],                    ARRAY['FORMULA']),
  ('e-circle',      '원의 둘레와 넓이',     '초6', '도형과 측정',   11, ARRAY['e-decimal'],                  ARRAY['FORMULA', 'ARITH']),
  ('e-volume',      '직육면체의 부피',      '초6', '도형과 측정',   12, ARRAY['e-mixed'],                    ARRAY['FORMULA']),
  ('e-mean',        '평균',                 '초5', '자료와 가능성', 13, ARRAY['e-mixed'],                    ARRAY['ARITH']),
  ('i-addsub',      '정수의 덧셈·뺄셈',     '중1', '수와 연산',     20, '{}',                                ARRAY['SIGN']),
  ('i-muldiv',      '정수의 곱셈·나눗셈',   '중1', '수와 연산',     21, ARRAY['i-addsub'],                   ARRAY['SIGN', 'DIVIDE']),
  ('q-calc',        '유리수의 계산',        '중1', '수와 연산',     22, ARRAY['e-frac-addsub', 'e-frac-muldiv', 'i-addsub'], ARRAY['FRACTION', 'SIGN']),
  ('x-expr',        '문자식과 식의 값',     '중1', '변화와 관계',   23, ARRAY['i-muldiv', 'e-pattern'],      ARRAY['EXPR_MEANING', 'SIGN']),
  ('x-dist',        '분배법칙',             '중1', '변화와 관계',   24, ARRAY['x-expr', 'i-muldiv'],         ARRAY['EXPR_MEANING', 'SIGN']),
  ('x-like',        '동류항 정리',          '중1', '변화와 관계',   25, ARRAY['x-expr', 'i-addsub'],         ARRAY['LIKE_TERMS']),
  ('eq-prop',       '등식의 성질·이항',     '중1', '변화와 관계',   26, ARRAY['e-box', 'i-addsub'],          ARRAY['TRANSPOSE', 'DIVIDE']),
  ('eq-solve',      '일차방정식 풀이',      '중1', '변화와 관계',   27, ARRAY['eq-prop', 'x-like', 'x-dist', 'i-muldiv'], '{}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stage = EXCLUDED.stage, area = EXCLUDED.area, position = EXCLUDED.position,
  prereqs = EXCLUDED.prereqs, errors = EXCLUDED.errors
WHERE concepts.area IS NULL;

-- 문제 틀 ↔ 개념
ALTER TABLE problem_templates ADD COLUMN IF NOT EXISTS concept_id TEXT;
UPDATE problem_templates SET concept_id = 'eq-prop'  WHERE concept_id IS NULL AND id IN ('t-ax-b-c', 't-ax-minus-b-c', 't-ax-c');
UPDATE problem_templates SET concept_id = 'eq-solve' WHERE concept_id IS NULL AND unit = '일차방정식';

-- 계산 틀 (레벨 테스트·이전 과정 복습용). 숫자는 problemBank.ts 의 CALC 생성기가 낼 때마다 바꾼다
INSERT INTO problem_templates (id, shape, pattern, unit, concept, targets, level, sample, concept_id) VALUES
  ('d-frac-add', 'frac-addsub', '분수 덧셈·뺄셈 (통분)',       '초등 복습',     '분수의 덧셈·뺄셈',   ARRAY['FRACTION'],               1, '계산하세요: 3/4 - 1/6',              'e-frac-addsub'),
  ('d-frac-mul', 'frac-muldiv', '분수 곱셈·나눗셈',            '초등 복습',     '분수의 곱셈·나눗셈', ARRAY['FRACTION'],               1, '계산하세요: 2/3 ÷ 4/9',              'e-frac-muldiv'),
  ('d-box',      'box',         '□ 구하기 (a × □ + b = c)',    '초등 복습',     '□가 있는 식',        ARRAY['TRANSPOSE'],              1, '□ 를 구하세요: 3 × □ + 4 = 19',     'e-box'),
  ('d-int-add',  'int-addsub',  '(-a) + b - (-c)',             '정수와 유리수', '정수의 덧셈·뺄셈',   ARRAY['SIGN'],                   1, '계산하세요: (-7) + 4 - (-3)',        'i-addsub'),
  ('d-int-mul',  'int-muldiv',  '(-a) ÷ b × (-c)',             '정수와 유리수', '정수의 곱셈·나눗셈', ARRAY['SIGN', 'DIVIDE'],         1, '계산하세요: (-12) ÷ 3 × (-2)',       'i-muldiv'),
  ('d-rat',      'rat-addsub',  '음수가 있는 분수 계산',       '정수와 유리수', '유리수의 계산',      ARRAY['FRACTION', 'SIGN'],       2, '계산하세요: (-2/3) + 1/4',           'q-calc'),
  ('d-expr-val', 'expr-value',  'x = a 일 때 식의 값',         '문자와 식',     '문자식과 식의 값',   ARRAY['EXPR_MEANING', 'SIGN'],   1, 'x = -2 일 때, 3x - 5 의 값은?',  'x-expr'),
  ('d-dist',     'distribute',  'k(ax + b) 간단히',            '문자와 식',     '분배법칙',           ARRAY['EXPR_MEANING', 'SIGN'],   2, '간단히 하세요: -2(3x - 4)',          'x-dist'),
  ('d-like',     'like-terms',  'ax + b + cx + d 간단히',      '문자와 식',     '동류항 정리',        ARRAY['LIKE_TERMS'],             1, '간단히 하세요: 5x - 3 - 2x + 7',     'x-like'),
  ('d-mixed',      'mixed',       '자연수 혼합 계산 (괄호·곱셈·나눗셈)', '초등 복습', '자연수의 혼합 계산', ARRAY['ARITH'],            1, '계산하세요: 30 - 4 × (7 - 2) ÷ 2',          'e-mixed'),
  ('d-factor',     'factor',      '최대공약수·최소공배수',     '초등 복습',     '약수와 배수',        ARRAY['FRACTION'],               1, '두 수 18, 24 의 최대공약수를 구하세요.',         'e-factor'),
  ('d-decimal',    'decimal',     '소수의 곱셈·나눗셈',        '초등 복습',     '소수의 곱셈·나눗셈', ARRAY['ARITH', 'DIVIDE'],        1, '계산하세요: 2.4 × 1.5',                     'e-decimal'),
  ('d-pattern',    'pattern',     '대응 관계로 값 구하기',     '초등 복습',     '규칙과 대응',        ARRAY['EXPR_MEANING'],           1, 'y 는 x 의 3배보다 2 큰 수입니다. x = 5 일 때 y 의 값은?', 'e-pattern'),
  ('d-ratio',      'ratio',       '비율·백분율',               '초등 복습',     '비와 비율·백분율',   ARRAY['FRACTION'],               1, '60 의 35% 는 얼마입니까?',                   'e-ratio'),
  ('d-proportion', 'proportion',  '비례식에서 □ 구하기',       '초등 복습',     '비례식',             ARRAY['DIVIDE'],                 1, '□ 를 구하세요: 3 : 4 = □ : 20',             'e-proportion'),
  ('d-area',       'area',        '삼각형·평행사변형·사다리꼴 넓이', '초등 복습', '다각형의 넓이',    ARRAY['FORMULA'],                1, '밑변이 8 cm, 높이가 5 cm 인 삼각형의 넓이는 몇 cm² 입니까?', 'e-area'),
  ('d-circle',     'circle',      '원의 둘레·넓이 (원주율 3.14)', '초등 복습',  '원의 둘레와 넓이',   ARRAY['FORMULA', 'ARITH'],       2, '반지름이 5 cm 인 원의 넓이는 몇 cm² 입니까? (원주율 3.14)', 'e-circle'),
  ('d-volume',     'volume',      '직육면체의 부피',           '초등 복습',     '직육면체의 부피',    ARRAY['FORMULA'],                1, '가로 4 cm, 세로 3 cm, 높이 5 cm 인 직육면체의 부피는 몇 cm³ 입니까?', 'e-volume'),
  ('d-mean',       'mean',        '자료의 평균',               '초등 복습',     '평균',               ARRAY['ARITH'],                  1, '5, 8, 6, 9, 7 의 평균을 구하세요.',          'e-mean')
ON CONFLICT DO NOTHING;

-- 과제 종류: normal(일반·보충) / diagnostic(입학 레벨 테스트)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'normal';

-- 레벨 테스트 기간은 두지 않는다 (언제 낼지는 교사가 정함). 이전 버전에서 만든 기간 칸 정리
ALTER TABLE classes DROP COLUMN IF EXISTS diagnostic_from;
ALTER TABLE classes DROP COLUMN IF EXISTS diagnostic_to;

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;

-- 문제은행: '무엇을 연습시키는 문제인지' 이름표가 붙은 문제 틀
-- 문제를 하나하나 저장하지 않고 틀만 저장한다. 숫자는 낼 때마다 바꿔서 만들고 (app/src/lib/problemBank.ts),
-- 실제로 학생에게 낸 문제만 problems 에 남는다 (problems.template_id 로 어느 틀에서 나왔는지 기록)
-- 다시 실행해도 안전. 이미 있는 틀은 덮어쓰지 않는다 (교사가 이름표를 고쳤을 수 있으므로)

CREATE TABLE IF NOT EXISTS problem_templates (
  id         TEXT PRIMARY KEY,
  shape      TEXT NOT NULL,                    -- 숫자를 바꿔 만드는 생성기 이름 (problemBank.ts 의 SHAPES)
  pattern    TEXT NOT NULL,                    -- 교사에게 보여 줄 틀 모양 (예: ax + b = c)
  grade      INT  NOT NULL DEFAULT 1,          -- 학년
  unit       TEXT NOT NULL DEFAULT '일차방정식', -- 단원
  concept    TEXT NOT NULL,                    -- 관련 개념
  targets    TEXT[] NOT NULL,                  -- 연습시키는 오류 유형 (ErrorType: SIGN, LIKE_TERMS, TRANSPOSE, DIVIDE, EXPR_MEANING)
  level      INT  NOT NULL DEFAULT 1,          -- 난이도 1 쉬움 · 2 보통 · 3 어려움
  sample     TEXT NOT NULL,                    -- 예시 문항
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 중1 '문자와 식 · 일차방정식' 초안 (수학교사 검토 필요)
INSERT INTO problem_templates (id, shape, pattern, concept, targets, level, sample) VALUES
  ('t-ax-b-c',        'ax+b=c',       'ax + b = c',          '등식의 성질·이항',      ARRAY['TRANSPOSE'],                 1, '2x + 3 = 11'),
  ('t-ax-minus-b-c',  'ax-b=c',       'ax - b = c',          '이항·정수 계산',        ARRAY['TRANSPOSE', 'SIGN'],         1, '5x - 7 = 3'),
  ('t-ax-c',          'ax=c',         'ax = c (음수 포함)',   '계수 나누기',          ARRAY['DIVIDE', 'SIGN'],            1, '-3x = 12'),
  ('t-b-minus-ax-c',  'b-ax=c',       'b - ax = c',          '이항·정수 계산',        ARRAY['TRANSPOSE', 'SIGN', 'DIVIDE'], 2, '7 - 2x = 1'),
  ('t-ax-b-c-neg',    'ax+b=c,neg',   'ax + b = c (해가 음수)', '정수 계산·계수 나누기', ARRAY['SIGN', 'DIVIDE'],           2, '3x + 10 = 4'),
  ('t-like-same',     'ax+bx+c=d',    'ax + bx + c = d',     '동류항 정리',          ARRAY['LIKE_TERMS'],                2, '3x + 2x - 4 = 11'),
  ('t-both-sides',    'ax+b=cx+d',    'ax + b = cx + d',     '동류항 정리·이항',      ARRAY['LIKE_TERMS', 'TRANSPOSE'],   2, '4x - 5 = 2x + 7'),
  ('t-both-sides-neg','ax+b=cx+d,neg','ax + b = cx + d (x 계수가 음수로)', '동류항 정리·정수 계산', ARRAY['LIKE_TERMS', 'SIGN'], 3, '2x + 9 = 5x - 3'),
  ('t-paren-c',       'k(x+m)=c',     'k(x + m) = c',        '분배법칙',            ARRAY['EXPR_MEANING', 'SIGN'],      2, '3(x - 2) = 9'),
  ('t-paren-both',    'k(x+m)=cx+d',  'k(x + m) = cx + d',   '분배법칙·동류항 정리',   ARRAY['EXPR_MEANING', 'LIKE_TERMS'], 3, '3(x - 2) = x + 4'),
  ('t-neg-paren',     '-(x+m)=c',     '-(x + m) = c',        '분배법칙·부호',        ARRAY['SIGN', 'EXPR_MEANING'],      3, '-(x - 4) = 7')
ON CONFLICT DO NOTHING;

-- 실제로 낸 문제가 어느 틀에서 나왔는지
ALTER TABLE problems ADD COLUMN IF NOT EXISTS template_id TEXT;

ALTER TABLE problem_templates ENABLE ROW LEVEL SECURITY;

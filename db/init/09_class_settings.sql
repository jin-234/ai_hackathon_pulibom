-- 교사 설정 (반마다): 반복 학습 기준, 입학 레벨 테스트 파트 구성
--   data 예: {"mastery": 4, "levelParts": [{"no": 1, "name": "...", "area": "...", "concepts": ["e-mixed"]}]}
--   칸이 없으면 코드의 기본값 (src/lib/classSettings.ts). 다시 실행해도 안전
CREATE TABLE IF NOT EXISTS class_settings (
  class_id   TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE class_settings ENABLE ROW LEVEL SECURITY;

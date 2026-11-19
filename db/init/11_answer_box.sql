-- 답안 칸: 학생이 제출 버튼 옆 칸에 따로 쓴 최종 답과, 문항 정답과 바로 비교한 결과
--   answer_correct: true 같음 / false 다름 / NULL 비교할 수 없음(답안 칸이 비었거나 문항에 정답이 없음). 다시 실행해도 안전
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS answer_correct BOOLEAN;

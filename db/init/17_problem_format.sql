-- 문항 유형: 'choice' 객관식 (보기 ①②… 중 하나 고르기) / 'essay' 서술형 (풀이를 쓰고 답 적기)
--   NULL 은 유형을 정하기 전 예전 문항 (문제 글에 보기 번호 ①② 가 두 개 이상 있으면 객관식으로 본다). 다시 실행해도 안전
ALTER TABLE problems ADD COLUMN IF NOT EXISTS format TEXT;

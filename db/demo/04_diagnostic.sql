-- 입학 레벨 테스트는 MVP에서 뺐다 (2026-11-17). 예전에 넣은 시연용 레벨 테스트 데이터를 지운다
-- npm run db:demo 로 실행. 다시 실행해도 안전
DELETE FROM submissions WHERE problem_id LIKE 'demo-diag-c13-%' OR problem_id LIKE 'demo-level-c13-%';
DELETE FROM problems WHERE assignment_id IN ('demo-diag-c13', 'demo-level-c13') OR assignment_id LIKE 'demo-level-c13-%';
DELETE FROM assignments WHERE id IN ('demo-diag-c13', 'demo-level-c13') OR id LIKE 'demo-level-c13-%';

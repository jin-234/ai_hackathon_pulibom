-- 실시간 새로고침 신호 (Supabase Realtime Broadcast). 다시 실행해도 안전 (CREATE OR REPLACE / DROP IF EXISTS)
-- 풀이(submissions)가 바뀌면 (제출 · AI 분석 진행·완료 · 선생님 확인 · 다시 분석 · 삭제)
-- 그 학생의 반 채널과 학생 채널에 "바뀌었다"는 신호만 보낸다. 신호에는 학생 id 만 넣고 점수·풀이 내용은 넣지 않는다.
--   반 채널   pulibom:class:<반 id>     → 오늘의 교실 대시보드 · 확인할 풀이
--   학생 채널 pulibom:student:<학생 id> → 학생 상세 · 보충 지도
-- 선생님 화면은 신호를 받으면 지금처럼 우리 API(로그인 쿠키로 권한 확인)를 다시 불러 실제 데이터를 받는다.
-- 공개 채널이라 anon 키와 채널 이름을 아는 사람은 '무언가 바뀌었다'는 신호까지는 볼 수 있다 (데이터는 없음).
-- Supabase 가 아닌 Postgres(realtime 스키마 없음)에서는 함수가 아무것도 하지 않는다.

CREATE OR REPLACE FUNCTION pulibom_notify_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid TEXT := COALESCE(NEW.student_id, OLD.student_id);
  cid TEXT;
BEGIN
  IF to_regproc('realtime.send') IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM realtime.send(jsonb_build_object('studentId', sid), 'changed', 'pulibom:student:' || sid, false);
    FOR cid IN SELECT class_id FROM class_members WHERE student_id = sid AND status <> 'pending' LOOP
      PERFORM realtime.send(jsonb_build_object('studentId', sid), 'changed', 'pulibom:class:' || cid, false);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- 신호를 못 보내도 풀이 저장은 그대로 (화면은 느린 폴링으로 따라잡는다)
    NULL;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS submissions_realtime ON submissions;
CREATE TRIGGER submissions_realtime
  AFTER INSERT OR UPDATE OR DELETE ON submissions
  FOR EACH ROW EXECUTE FUNCTION pulibom_notify_submission();

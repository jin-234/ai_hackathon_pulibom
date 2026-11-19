# 풀이봄 — 2026 AI 활용 전국 대학생 창업 해커톤

> 중학교 수학교사가 학생 각각의 약점을 파악하고 맞춤 지도를 돕는 AI 서비스

- **팀명**: 됐어요!! 쌤 저도 닭됐어요!!
- **팀원**: 최우진(팀장, 광운대) · 김명진(서경대) · 서호균(신한대) · 장준혁(대진대)
- **분야**: 지역 간 교육격차, 학습지원, 교육 접근성 개선 (AI 활용)

## 이거부터 보셈

1. [`기획서/아이디어_소개서.pdf`](기획서/아이디어_소개서.pdf) — 문제 정의, AI 적용, 실행 구상 전체
2. [`기획서/백월_창업아이템_소개.pdf`](기획서/백월_창업아이템_소개.pdf) — 한 장 요약 + 화면/흐름 이미지
3. [`개발계획.md`](개발계획.md) — 해커톤에서 만들 것과 순서

## 한 줄 요약

학생이 태블릿으로 푼 **손글씨 풀이**를 AI가 분석해 **어느 단계에서 막혔는지** 찾고,
교사에게 **취약 개념·반복 오류·보충 지도 방향**을 대시보드로 보여준다.
초기 범위는 **중1 '문자와 식 · 일차방정식'**.

## 서비스 흐름

```
① 풀이 기록 수집 → ② 문항·손글씨 인식 → ③ 풀이 분석·학습 요약
   (태블릿 웹앱)      (Upstage Document      (EXAONE 4.5 / Solar Pro)
                      Parse · OCR)
→ ④ 학급 데이터 모아보기 → ⑤ 학생 선택·근거 확인 → ⑥ 보충 지도·재풀이로 변화 확인
   (교사 대시보드)
```

## 결과물 (시연 대상)

| 화면 | 핵심 기능 |
|---|---|
| 학생용 태블릿 웹앱 | 배정 과제 확인, 펜·지우개 풀이 작성, 제출, 보충 과제 재풀이 |
| 교사용 학급 대시보드 | 학생별 제출 현황·정답률·풀이 시간·취약 개념·반복 오류·학습 변화 표, 정렬/필터 |
| 학생별 상세 분석 | 원본 풀이 + 오류 의심 위치·이유, 개념별 이력, 교사 관찰 메모, AI 결과 수정 |

시연 시나리오: **과제 배정 → 학생 풀이 → 학급 데이터 정렬 → 학생 상세 확인 → 보충 지도 → 결과 갱신**
(가상 데이터 화면과 실제 AI 처리 결과는 구분해서 보여주기)

## 기술 스택 (구현됨)

| 구분 | 사용 |
|---|---|
| 웹 | Next.js 15 (App Router) + TypeScript + Tailwind — `app/` |
| DB · 이미지 | **Supabase** (Postgres + Storage `solutions` 버킷) |
| 손글씨 OCR | **Upstage OCR** → (키 있으면) Mathpix → Claude |
| 풀이 분석 · 지도 제안 | **Claude Code 헤드리스** (`claude -p`, API 키 X, 구독 결제분 사용) |

### AI 파이프라인

```
학생 제출 (풀이 PNG + 최종 답 + 필기 이벤트)
  → Supabase Storage 업로드, submissions 저장, 최종 답 자동 채점
  → [백그라운드 큐]
     ① Upstage OCR      ── 성공 → 사용
          │ 실패
     ② Mathpix OCR      ── (MATHPIX 키 없으면 건너뜀)
          │ 실패
     ③ Claude 헤드리스   ── 이미지를 직접 읽어서 받아쓰기
          │ 실패
     → status = needs_review ("확인 필요")
  → Claude 헤드리스 풀이 분석: 원본 이미지 + OCR 결과 + 정답·모범풀이
     → 줄별 단계, 처음 틀린 줄, 오류 유형, 근거, 지도 제안, 확인 질문
  → submissions 업데이트 → 교사 대시보드 자동 새로고침
```

- **OCR 실패 기준**: 빈 결과 / 신뢰도 < `OCR_MIN_CONFIDENCE`(0.6) / 숫자·x·= 가 없음 / API 오류·타임아웃
- 어느 엔진이 읽었는지(`ocr_engine`)와 시도 내역(`ocr_attempts`)이 저장되고 교사 화면에 표시됨
- 오류 유형 5개 = 보충 개념 5개: 부호·계산 / 동류항 정리 / 등식 변형(이항) / 괄호 전개 / 분수·소수 계수
- 기획서의 EXAONE·Solar는 이후 `lib/analyze.ts`의 `analyzeSolution`만 바꿔 끼우면 됨

### Claude 헤드리스 주의

- 서버가 `claude` CLI를 직접 실행함 → **`claude` 로그인된 컴퓨터에서 서버를 띄워야** 함 (Vercel 배포 X, 시연은 노트북에서 `npm run dev`/`npm start`)
- 실행 시 `ANTHROPIC_API_KEY` 환경변수를 지워서 API 과금으로 안 넘어가게 해둠
- 한 건당 OCR 폴백 ~6초 + 분석 ~10초 (sonnet 기준). 동시 실행 수는 `ANALYSIS_CONCURRENCY`

## 실행 방법

1. **Supabase 프로젝트 생성** → SQL Editor에서 `supabase/schema.sql` → `supabase/seed.sql` 순서로 실행
2. **환경변수**: `app/.env.example` 을 `app/.env.local` 로 복사하고 값 채우기
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API)
   - `UPSTAGE_API_KEY`
   - (선택) `MATHPIX_APP_ID`, `MATHPIX_APP_KEY`
3. **Claude 로그인 확인**: 터미널에서 `claude` 실행돼야 함
4. 실행
   ```bash
   cd app
   npm install
   npm run dev          # http://localhost:3000
   ```
5. DB 없이 OCR+분석만 테스트: `npm run test:pipeline -- 풀이.png "3x + 6 = 15" 3 7`

## 화면

| 경로 | 내용 |
|---|---|
| `/student` → `/student/s01` | 학생 선택 → 과제 목록 (보충 과제 포함) |
| `/student/[id]/a/[과제]` | 문항 + 필기 캔버스(펜·지우개·색·되돌리기, 펜 사용 시 손바닥 무시) + 최종 답 → 제출 |
| `/teacher` | 학급 표: 제출·정답률·평균 풀이 시간·취약 개념·반복 오류·학습 변화·확인 필요, 과제/개념/상태 필터, 열 정렬 |
| `/teacher/students/[id]` | 개념별 오류 막대 + 보충 과제 배정, 관찰 메모, 풀이 카드(원본 이미지·OCR 엔진·단계별 분석·교사 수정·확인 완료·재분석) |

시드 데이터: 1학년 3반 6명, 문항 15개, 과제 2개, 과제 1에 가상 제출 28건(`가상` 배지로 구분).

## 체크리스트

- [x] 기술 스택 확정 & `app/` 세팅
- [x] 학생 풀이 화면 (필기 캔버스 + 제출)
- [x] OCR → 풀이 분석 파이프라인 (Claude 경로 테스트 완료)
- [ ] Upstage 키 넣고 실제 응답 확인
- [ ] Supabase 연결해서 제출 → 분석 → 대시보드 한 바퀴
- [x] 교사 대시보드 (표 + 정렬/필터)
- [x] 학생 상세 화면 (원본 풀이 + 분석 근거)
- [x] 보충 과제 배정 → 재풀이 → 변화 반영
- [ ] 시연용 가상 데이터 & 시나리오 리허설
- [ ] 발표 자료

## 주의

- 키는 `app/.env.local`에만 넣고 커밋하지 않기 (`.gitignore`에 등록됨). service role 키는 서버 코드에서만 사용
- `기획서/아이디어_소개서.pdf`에는 팀원 개인정보(생년월일·서명)가 있으니 레포 공개 전환 금지
- 학생 데이터는 가상 데이터만 사용, 외부 AI에는 풀이 영역만 전달

## Git 명령어

```bash
git clone https://github.com/jin-234/ai_hackathon_pulibom.git
git pull                       # 작업 전 항상
git add . && git commit -m "메시지"
git push
```

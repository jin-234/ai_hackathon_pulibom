# 풀이봄 웹앱 (Next.js)

```bash
cd app
npm install
npm run dev        # http://localhost:3000
```

API 키는 **저장소 루트의 `.env`** 에서 읽습니다 (`../.env.example` 참고, `src/lib/env.ts`).

## 데이터베이스 (Supabase) — 필수

모든 데이터(학급·교사·학생, 과제·문항, 풀이·**풀이 이미지**·AI 분석, AI 학습 요약)는 Supabase(PostgreSQL) 하나에 저장하고 팀 전체가 같이 씁니다.
접속은 루트 `.env` 의 `DATABASE_URL` 하나로 해요 (세팅 방법은 [루트 README '실행 방법'](../README.md#실행-방법)).

| 명령 (`app/` 에서) | 하는 일 |
|---|---|
| `npm run db:setup` | `db/init/*.sql` 실행 → 테이블·시연 명단·기본 과제 (여러 번 실행해도 안전) |
| `npm run db:import` | 예전에 파일(`app/data/*.json`, `*.png`)로 저장하던 데이터를 DB로 옮김 (이미 옮긴 건 건너뜀) |
| `npm run db:demo` | 시연 데이터 추가 (`db/demo/*.sql`, 여러 번 실행해도 안전). 학년도 이력(2025→2026), 소그룹 테스트용 풀이, 반복 학습 순환(s02), AI 요약 확인용 1학년 5반. `04_diagnostic.sql`은 예전 레벨 테스트 시연 데이터를 지우기만 함 |
| `npm run test:weakness` | AI 채점·약점 요약 프롬프트 검사 (더미 학생 20명, 실제 Solar 호출). `-- 설문` 으로 설문 유형 학생만. 결과: 채점·오류 유형 88/88, 약점 20/20, 말투 20/20, 내용 규칙 20/20 |
| `npm run test:ocr` | 필기 인식 검사: DB 의 실제 필기 획을 OCR(+ Mathpix → Claude 다시 읽기) → 정답 라벨(`data/ocrbench/labels.json`, git 제외)과 줄마다 비교. `-- --no-vision` 다시 읽기 끄기, `-- --vision=lines` 줄 단위 방식 |

- Supabase 웹 API(Data API)로는 테이블에 접근하지 못하게 막아 뒀어요 (`db/init/04_security.sql`, RLS). 앱은 `DATABASE_URL` 로 직접 접속해요.
- 인터넷이 끊기면 DB도 안 돼요. 로컬 PostgreSQL 주소를 `DATABASE_URL` 에 넣으면 같은 코드로 그대로 돌아가요 (`npm run db:setup` 부터).

| 테이블 | 내용 |
|---|---|
| `classes`, `teachers`, `teacher_classes` | 반(학년도·보관 여부·`join_code` 반 코드)·교사·교사별 담당 반 |
| `students`, `class_members` | 학생 계정(졸업까지 그대로, 비밀번호는 해시), 학년도별 반 소속 이력 |
| `assignments`, `problems` | 과제(공개·마감·마감 예약·개별 배정·보충 정보), 문항 |
| `submissions` | 풀이: 풀이 이미지(PNG), 필기 획·입력 기록, OCR, AI 분석, 교사 확인·메모 (JSONB) |
| `student_summaries` | 학생별 AI 학습 요약 |
| `problem_templates` | 문제은행: 문제 틀 + 이름표(개념·연습시키는 오류·난이도·`concept_id`). 숫자는 낼 때마다 바꿔서 생성 (`src/lib/problemBank.ts`), 실제로 낸 문제만 `problems.template_id` 로 남음 |
| `concepts` | 개념 지도: 초등 과정 13개(예전 레벨 테스트 범위, 지금은 안 씀) + 중1 개념, 개념마다 앞 개념(`prereqs`)·자주 나는 오류 (`db/init/07_diagnostic.sql`) |
| `class_settings` | 교사 설정 (반마다 JSON: 반복 학습 기준 `mastery`). 없으면 기본값 (`db/init/09_class_settings.sql`) |

테이블 정의는 `db/init/*.sql` 이에요. 학생 이름은 `students` 에만 있고, 풀이·분석은 학생 id 로만 연결돼요.

**반·열람 규칙** (`src/lib/classes.ts`, 자세한 내용은 [개발계획](../개발계획.md#학급반-관리-브랜치-featclass-roster))
- 과제는 반마다 따로. 교사는 담당 반(`teacher_classes`)의 과제·학생만 봐요
- 학년이 끝난 반은 **보관**(대시보드의 '반 보관' 버튼): 학생 화면에서 사라지고, 교사에게는 읽기 전용 '지난 반'
- 지금 담당 반 학생이면 **지난 학년 기록까지 전부** 보이고, 지난 기록은 읽기 전용 (학년도·반·담당 교사 표시)
- 시연 데이터 `npm run db:demo`
  - `db/demo/01_years.sql`: 2025학년도 1학년 1반(김선생님, 보관됨) → 2026학년도 2학년 1반(박선생님 `teacher2`), 2학년 1반 이항 오류 소그룹(서○○·문○○)
  - `db/demo/02_class13_groups.sql`: 1학년 3반 소그룹 테스트용 풀이 (이항 4명 · 부호 2명 · 동류항 2명)
  - AI 결과는 직접 만든 예시라 화면에 'AI 분석 (시연용 예시)'로 표시되고 원본 이미지는 없어요
  - `db/demo/05_ai_summary_check.sql`: **1학년 5반**(`teacher`) 학생 8명·풀이 35건, AI 학습 요약 확인용. 채점은 실제 AI(`analyzeSolution`) 결과
    - 1 조건 놓침 · 2 구하는 값 혼동 · 3 괄호 실수 두 가지 · 4 대입 괄호 · 5 음수 부호(다시 풀어 고침) · 6 이항 부호(선생님 메모) · 7 잘하는 학생 · 8 글씨체 문제 + 뺄셈 실수
    - 학생 상세에서 'AI로 요약하기'를 누르면 약점·근거·글씨체 안내를 볼 수 있어요

## 로그인 (프로토타입)

| 역할 | 데모 계정 |
|---|---|
| 선생님 | `teacher` / `1234` (2026 1학년 3반, 1학년 5반(`db:demo`) + 지난 반 2025 1학년 1반) |
| 선생님 | `teacher2` / `1234` (2026 2학년 1반, `npm run db:demo` 후) |
| 학생 | 반·번호 선택 + `0000` |

"로그인 건너뛰고 둘러보기"로 바로 들어갈 수도 있어요. 교사 화면은 교사만, 학생 화면은 학생만 들어갈 수 있습니다 (`src/middleware.ts`).
⚠️ 쿠키에 역할만 담는 시연용 방식이라 실제 서비스에서는 학교 계정 연동·서명된 세션으로 바꿔야 해요.

## 화면

| 주소 | 내용 |
|---|---|
| `/login` | 웹 브라우저: 선생님 로그인만 · 아이패드 앱: 학생 로그인(반 → 번호), 학생 '반 코드로 회원가입' 링크. 로그인 건너뛰기 |
| `/signup` | 학생 회원가입: 반 코드(6자리, 어느 반인지 먼저 보여 줌) + 번호 + 이름 + 비밀번호 → 바로 그 반 학생 + 로그인. `?code=` 로 코드 채움 |
| `/student` | 학생 과제 목록: **지금 풀 과제**(마감 빠른 순) → 다 푼 과제 → **지난 과제**(접기). 보충 과제 포함, 진행률·마감 시각 |
| `/student/[과제ID]` | 학생 풀이 화면: 문항 + 필기 캔버스(펜·연필·형광펜·지우개), 풀이 시간, 제출 (답은 풀이 마지막 줄에 쓰면 AI가 인식) |
| (교사 상단 바) | 로고 → 오늘의 교실, '과제 출제' 버튼, 메시지, 이름·아바타 → 설정, 로그아웃 (탭 없음) |
| `/teacher` | 오늘의 교실: **위쪽 고정 바**(반 선택 · 과제 · 기간(전체/이번 주/이번 달/직접 지정) · 학생 이름 검색 · '⋯ 반 관리'(반 코드 복사·가입 주소·새 코드, 반 보관)) → **오늘 할 일** 3칸(확인할 풀이 · 안 낸 학생 · 같은 실수 소그룹, 누르면 해당 탭으로) → 탭 **학생**(제출·정답률·취약 개념·반복 오류·변화·마지막 제출을 한 표에, 거르기 전체/미제출/일부 제출/다 냄/확인 필요, 취약 개념, 머리글 정렬) / **확인할 풀이**(왼쪽 목록 → 오른쪽에서 확인, '확인·저장 후 다음') / **소그룹**(같은 실수 학생 묶음 → 그룹 보충 과제). 학생을 누르면 **오른쪽 패널**에 학생 상세(Esc 닫기, 좁은 화면은 전체 화면), '확인 n' 배지는 풀이 기록·확인 필요로 바로. 탭·거르기·열린 학생은 주소(`?tab=&f=&sid=`)에 남음 |
| `/teacher/assign` | 과제 출제: 반 선택, **교육과정에서 고르기**(반 학년의 대단원 → 소단원 → 과제 이름 채움, 문제은행 또는 AI로 문항 만들기, AI 문항은 검산 후 어긋나면 ⚠ 표시), 자유 입력(일차방정식은 정답·해설 자동), 학생에게 공개/비공개, 마감 예약(달력 + 시간 휠). AI 문항은 조건 모순·학년 범위 밖이면 버리고 다시 만듦. 출제한 과제는 진행 중/마감 · 일반/보충으로 거르고, 문항은 눌러야 펼침(문항마다 정답 표시, 눌러서 고치기). 삭제하면 그 과제 풀이도 함께 지워짐(확인창에 개수), 숨기기만은 '비공개로'. 출제 폼은 스크롤해도 고정 |
| `/teacher/settings` | 교사 설정 (반마다, 안 바꾸면 기본값): **반복 학습 기준**(극복한 오류·익힌 틀로 볼 연속 정답 수 2~8번, 기본 4). DB `class_settings` |
| `/teacher/students/[id]` | 학생 상세 (오늘의 교실 오른쪽 패널과 같은 화면): 정답률·제출·다 낸 과제·평균 시간 → **개념별 이해도** 그래프(낮은 개념부터) → AI 학습 요약(요약 문단만, 확인할 개념·주의할 점은 접힘. 개념마다 근거 풀이를 **학생 손글씨 이미지**로, 틀린 줄에 빨간 테두리) → 탭 **풀이 기록**(한 줄 목록, 전체·틀린 풀이·확인 필요, 10개씩 → 누르면 원본 풀이·OCR 인식 식·오류 의심 줄·AI 근거·교사 수정·메모, 지난 학년은 읽기 전용) / **보충 지도**(학습 프로필 + 보충 문항 1~10개, 문제은행 우선) |

## 흐름

제출 → `POST /api/submissions` → 필기 PNG·획 로그 저장 → **업스테이지 OCR**(획을 다시 그린 OCR 전용 이미지, 확신 없는 줄이 있으면 **Mathpix → Claude** 가 다시 읽음, 빗금·지운 흔적은 획에서 찾아 뺌) → **Solar 보정**(문항의 미지수에 맞춰 비슷한 글자 고치기) → **Solar Pro 채점**(코드 검산 + 빗금 표시) → 교사 화면에 반영
(분석 중 / 분석 완료 / 확인 필요 / 오류 상태 표시, OCR 이 이상하게 읽은 풀이는 `✎ 글씨체`)

**채점·약점 분석** (`src/lib/pipeline.ts` → `ai.ts` → `summary.ts`)

```
OCR 전용 이미지  두 획으로 쓴 x(ɔc·ㄱL)를 반듯한 X 로 다시 그림 (미지수가 x 일 때만)
보정             미지수(variableOf: x·y·a·b·m·n·i, 없으면 계산 문항)에 맞춰 0↔x, 6↔b 같은 글자 고치기
채점             풀이 읽기 → 처음 틀린 줄 → 채점 → 오류 유형 하나 → 근거 (temperature 0)
                 코드 검산 힌트: 줄마다 해, 바뀐 쪽, 음수가 낀 계산 / 양수끼리 계산 / x 항 모으기
학생 요약        코드가 오류 유형을 세어 약점 정도(높음·보통·낮음)를 정함 → AI 가 문장 + 근거 풀이 번호
                 → 코드가 근거가 실제로 그 유형인지 확인하고 '앞 줄 → 틀린 줄'·채점 이유를 붙임
```

- 오류 유형은 교사 설문 8개(조건 놓침, 구하는 값 혼동, 음수 부호, 괄호 일부만 곱함, 괄호 앞 음수 부호, 대입 괄호, 이항 부호, 덧셈·뺄셈 계산) + 동류항·계수 나누기·문자식 의미·분수·공식. 목록은 [개발계획 '오류 유형'](../개발계획.md#오류-유형-2026-11-17)
- **글씨체 문제** (`types.ts` `handwritingIssue`): 이상한 글자·성립 안 하는 숫자 등식·보정이 고친 줄·낮은 신뢰도·하나도 못 읽음. 약점 집계에서는 빠지고, 2개 이상 또는 30% 이상이면 요약 '직접 확인해 주세요'에 안내
- 학생 이름·id 는 AI 에 보내지 않아요. 풀이가 그대로면 저장된 요약을 다시 써요
- 이미 분석된 풀이는 예전 방식 그대로예요. 새 OCR·유형을 쓰려면 다시 분석해야 해요

**보충 지도 (단점 위주 학습)**

```
풀이 분석 결과 누적 → 학생별 가장 많은 오류 유형·취약 개념
   ├ 개인 보충: 학생 상세 '보충 지도' → 문항 수 고르기 → 후보 확인·수정 → 이 학생에게 배정
   └ 소그룹 보충: 대시보드 '소그룹'(같은 실수 2명 이상) → 받을 학생·문항 수 → 한 번에 배정
후보 순서: ① 문제은행 약 2/3 (약점에 맞는 틀을 **틀마다 하나씩**, 쉬움·보통·어려움을 섞어서 — 같은 틀을 숫자만 바꿔 되풀이하지 않음) ② AI 약 1/3 (같은 오류를 **다른 모양**으로: 문장제·좌우가 바뀐 식·괄호·양변 x. 이미 고른 문항과 모양이 같은 식은 버림. 문장제는 함께 받은 식을 풀이기로 풀고, 다른 AI가 문장만 보고 다시 풀어 답이 같은 것만) ③ 그래도 모자라면 안 쓴 틀 → 마지막에만 오답 문항 숫자 바꾸기 — 식 문항은 모두 풀이기로 검증
재풀이 결과·AI 변화 분석은 학생마다 따로 쌓인다 (그룹 보충도)
학습 기록 반영: 극복한 오류·익힌 틀·잘하는 개념은 뒤로 (src/lib/learningProfile.ts)
```

## 입학 레벨 테스트 (MVP에서 뺌)

2026-11-17에 출제·결과·설정·보충 연결을 모두 뺐다. DB 스키마(`concepts`, `assignments.kind`, 초등 계산 틀)는 남겨 두었고, 예전에 낸 레벨 테스트 과제(`kind = 'diagnostic'`)는 반 지표·학습 프로필 계산에서 계속 뺀다.

## 문제은행 틀 추가·수정

- 틀 목록은 DB `problem_templates` (처음 내용은 `db/init/06_problem_bank.sql` 중1 일차방정식 11개 + `07_diagnostic.sql` 계산 틀 19개: 초등 과정 13개 개념 + 중1 계산 6개)
- **이름표만 바꾸기**(개념·연습시키는 오류·난이도·사용 여부): Supabase Table Editor 에서 `concept`, `targets`, `level`, `active` 수정. `db:setup` 을 다시 돌려도 덮어쓰지 않아요
- **새 모양의 틀 추가**: `src/lib/problemBank.ts` 의 `SHAPES`(방정식, 풀이기로 정답) 또는 `CALC`(계산·간단히 하기, 생성기가 정답까지)에 숫자 생성기를 넣고, `problem_templates` 에 그 `shape` 이름과 `concept_id` 로 행 추가
- `targets` 에 쓰는 오류 유형: `SIGN`(부호·정수 계산), `LIKE_TERMS`(동류항), `TRANSPOSE`(등식 변형·이항), `DIVIDE`(계수 나누기), `EXPR_MEANING`(문자식 의미·분배법칙), `FRACTION`(분수 계산), `ARITH`(자연수·소수 계산, 계산 순서), `FORMULA`(넓이·부피·비율·평균 공식 적용), `PAREN_SIGN`(괄호 앞 음수 부호), `DISTRIBUTE`(괄호 풀기·분배), `SUBSTITUTE`(대입할 때 괄호), `CONDITION`(조건 놓침), `TARGET`(구하는 값 혼동)
- 틀은 초안이라 수학교사 검토가 필요해요

## 코드 위치

| 파일 | 역할 |
|---|---|
| `src/components/InkCanvas.tsx` | 필기 캔버스, 획 좌표·시간·삭제 이벤트 기록 |
| `src/lib/ai.ts` | OCR 호출·보정(`correctOcr`), 채점 프롬프트(`analyzeSolution`, 오류 유형 기준 `ERROR_GUIDE`·설문 `TEACHER_PICKS`), 코드 검산 힌트(`checkLines`) (모델은 `.env` 로 교체) |
| `src/lib/ocrImage.ts` | OCR 전용 이미지: 저장된 획을 다시 그려 인식률을 높임 (`sharp`), 두 획 x 를 반듯하게 다시 그리기. OCR 뒤 확신 없는 줄이 있으면 Mathpix → Claude 다시 읽기, 근거 이미지용 줄 위치(`lineBoxesOf`) |
| `src/lib/vision.ts` | OCR 다시 읽기: 확신 없는 줄 고르기(`suspectLines`), 이미지 전체 다시 읽기(`readWhole`: Mathpix(키 있을 때) → Claude) / 줄만 잘라 다시 읽기(`rereadLines`, Claude). 모두 실패하면 OCR 결과 그대로 |
| `src/lib/claudeCli.ts` | Claude Code 헤드리스 호출(`claude -p --output-format json`, 구독 사용, `ANTHROPIC_API_KEY` 제거, MCP·세션 저장 끔, 180초). 이미지는 임시 폴더 파일 + Read 도구만 허용 |
| `src/lib/pipeline.ts` | 제출 → OCR → 채점 흐름 (문항 미지수를 OCR·보정에 넘김) |
| `src/lib/types.ts` | 공용 타입·오류 유형 이름, 미지수 찾기(`variableOf`), 글씨체 문제 판정(`handwritingIssue`) |
| `src/lib/buildProblems.ts` | 교사가 직접 넣은 문항의 정답·해설 (x 외 미지수 y·a·b… 도) |
| `src/components/AiSummary.tsx` | 학생 상세 AI 학습 요약: 약점·근거(앞 줄 → 틀린 줄, 채점 이유, 선생님 확인) |
| `scripts/test-weakness.ts`, `scripts/test-ocr.ts` | `npm run test:weakness`, `npm run test:ocr` |
| `src/lib/problems.ts` | 기본 시연 문항 6개 (중1 일차방정식) |
| `src/lib/equation.ts` | 일차방정식 풀이기: 정답·해설 생성, 비슷한 문항 생성 |
| `src/lib/assignments.ts` | 과제·문항 저장 (DB) |
| `src/lib/supplement.ts` | 보충 지도: 개인·소그룹 보충 후보(문제은행 틀마다 하나씩 → AI 다른 모양·문장제 → 숫자 바꾸기, 풀이기·검산 검증), 학생별 보충 기록(전후 비교), 학생별 AI 변화 분석 |
| `src/lib/problemBank.ts` | 문제은행: 틀 모양별 숫자 생성기(방정식 `SHAPES`, 계산 `CALC`), 약점에 맞는 틀 고르기 |
| `src/lib/learningProfile.ts` | 학습 프로필: 남은 약점·극복한 오류·익힌 틀·잘하는 개념 (다음 보충 선택에 반영, 기준 4번 연속 정답) |
| `src/lib/classSettings.ts`, `src/lib/settings.ts` | 교사 설정: 기본값·입력 확인(화면·서버 공용) / DB 읽기·저장, 학생 기준 설정(지금 반). 테이블이 없으면 기본값 |
| `src/lib/classes.ts`, `src/lib/guard.ts` | 반·반 소속·보관, 교사 열람 권한(지금 담당/지난 반), API 권한 확인 |
| `src/lib/summary.ts` | 학생별 AI 학습 요약 (Solar, 이름 제외, DB `student_summaries`): 오류 유형 집계·약점 정도는 코드, 근거 확인(`proofsOf`), 글씨체 안내 |
| `src/lib/classStats.ts` | 실제 제출 → 학생별 정답률·취약 개념·반복 오류·확인 필요·학습 변화 계산 |
| `src/lib/db.ts`, `src/lib/roster.ts` | DB 연결, 로그인 명단(지금 반 기준)·로그인 |
| `src/lib/signup.ts` | 반 코드로 학생 회원가입, 반 코드 조회·새로 만들기 |
| `src/lib/store.ts` | 풀이 저장 (DB, 이미지 포함), 풀이마다 어느 학년도·반 기록인지 같이 조회 |
| `src/components/GroupSupplement.tsx` | 대시보드 소그룹 묶기 + 그룹 보충 패널 |
| `src/lib/curriculum.ts`, `src/lib/unitProblems.ts` | 학년별 교육과정 단원 목록(2022 개정, 초안) / 소단원 문항 만들기: 문제은행 틀 또는 AI + 검산(풀이기 · 대입 검산식 계산 · 정답 안 보여 주고 다시 풀기) |
| `src/components/CurriculumPicker.tsx` | 과제 출제의 '교육과정에서 고르기' |
| `src/components/LearningProfileCard.tsx`, `src/components/StudentDetail.tsx` | 학생 상세: 학습 프로필 카드, 탭(보충 지도·풀이 기록·개념별 정답률) |
| `src/components/SupplementPanel.tsx` | 학생 상세 보충 지도 패널 (문항 수 선택 포함) |
| `src/components/DateTimePicker.tsx` | 날짜 달력 + 시간 휠 (마감 예약, 기간 필터) |
| `src/components/useTeacherClass.ts` | 교사가 고른 반 (대시보드·과제 출제가 같이 씀) |
| `scripts/db-setup.ts`, `scripts/db-demo.ts`, `scripts/db-import-files.ts` | `npm run db:setup`, `npm run db:demo`, `npm run db:import` |

- 대시보드는 **실제 제출**(DB에 들어 있는 풀이) 기준 수치만 보여 줘요. 시연할 때는 DB에 더미 제출을 넣어서 써요.
- 정답률은 문항별 최신 풀이 기준, 확인 필요 풀이는 정답률에서 빠져요. 반복 오류는 서로 다른 문항에서 같은 오류가 2번 이상일 때예요.
- 소그룹은 학생마다 **가장 많이 나온 오류 유형**(1번이어도, 없으면 취약 개념)이 같은 학생 2명 이상이에요. 기간·과제 필터를 바꾸면 묶음도 따라 바뀌어요.
- 학생으로 로그인해 제출하면 교사 화면에서 그 학생을 누를 때 결과가 보입니다.

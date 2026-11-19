-- 풀이봄 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행 (schema.sql → seed.sql 순서)
-- 모든 접근은 Next 서버(service role 키)를 거친다. RLS는 켜두고 정책은 없음 → anon 키로는 아무것도 못 읽음.

create table if not exists classes (
  id text primary key,
  name text not null
);

create table if not exists students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  number int not null,
  name text not null
);

-- concept: integer_ops | like_terms | transposition | distribution | fraction_coef
create table if not exists problems (
  id text primary key,
  unit text not null default '문자와 식 · 일차방정식',
  concept text not null,
  content text not null,
  answer text not null,
  solution text not null,
  difficulty int not null default 1
);

-- kind: regular(학급 과제) | remedial(학생 개별 보충 과제)
create table if not exists assignments (
  id text primary key default gen_random_uuid()::text,
  class_id text not null references classes(id) on delete cascade,
  student_id text references students(id) on delete cascade,
  kind text not null default 'regular' check (kind in ('regular', 'remedial')),
  title text not null,
  concept text,
  created_at timestamptz not null default now()
);

create table if not exists assignment_problems (
  assignment_id text not null references assignments(id) on delete cascade,
  problem_id text not null references problems(id) on delete cascade,
  position int not null,
  primary key (assignment_id, problem_id)
);

-- status: pending | processing | done | needs_review | error
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id text not null references assignments(id) on delete cascade,
  problem_id text not null references problems(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,

  -- 풀이 기록
  image_path text,
  final_answer text,
  is_correct boolean,
  started_at timestamptz,
  submitted_at timestamptz,
  duration_sec int,
  stroke_count int not null default 0,
  erase_count int not null default 0,
  away_sec int not null default 0,
  events jsonb not null default '[]',

  -- OCR
  ocr_engine text,            -- upstage | mathpix | claude | demo
  ocr_text text,
  ocr_confidence real,
  ocr_attempts jsonb not null default '[]',

  -- AI 분석
  status text not null default 'pending',
  analysis jsonb,
  error_type text,            -- AI 판정
  concept text,               -- 오류와 관련된 개념
  error_message text,

  -- 교사 확인
  teacher_error_type text,    -- 교사가 고친 오류 유형 (있으면 AI 판정보다 우선)
  teacher_note text,
  reviewed boolean not null default false,

  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists submissions_student_idx on submissions(student_id, created_at);
create index if not exists submissions_assignment_idx on submissions(assignment_id);

create table if not exists teacher_notes (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references students(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table classes enable row level security;
alter table students enable row level security;
alter table problems enable row level security;
alter table assignments enable row level security;
alter table assignment_problems enable row level security;
alter table submissions enable row level security;
alter table teacher_notes enable row level security;

-- 풀이 이미지 저장소 (비공개)
insert into storage.buckets (id, name, public)
values ('solutions', 'solutions', false)
on conflict (id) do nothing;

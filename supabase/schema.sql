-- Esquema de Supabase para la plataforma del TFM
-- Pegar en el SQL Editor de Supabase (Dashboard > SQL Editor > New query)

-- ============================================================
-- 1. Tabla: profiles (perfil del usuario, del cuestionario)
-- ============================================================
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  age              int,
  education_level  text,
  employment_status text,
  learning_goal    text,           -- objetivo de aprendizaje (users_synthetic.csv)
  knowledge_level  text,          -- bajo | medio | alto
  interests        jsonb default '{}'::jsonb,  -- {topic: valor}
  format_pref      jsonb default '{}'::jsonb,
  risk             numeric,
  activity         numeric,
  big_three        jsonb default '[]'::jsonb,  -- respuestas a las Big Three (índices)
  updated_at       timestamptz default now()
);

-- ============================================================
-- 2. Tabla: interactions (interacciones usuario-contenido)
-- Esquema de eventos alineado con generate_interactions_v3.csv:
--   event: view | started | completed | quiz_passed | quiz_failed
--   score: 0-1. Solo los eventos de dominio (completed/quiz_passed)
--     tienen score >= 0.5 (relevantes). Sirve para reentrenar el modelo.
-- ============================================================
create table if not exists public.interactions (
  id                 bigint generated always as identity primary key,
  user_id            uuid references auth.users (id) on delete cascade,
  content_id         text not null,
  event              text not null default 'view',
  score              numeric default 0,
  time_spent_seconds int,
  session_id         text,
  is_recommended     boolean default false,
  created_at         timestamptz default now()
);

-- ============================================================
-- 3. Tabla: progress (progreso por contenido)
-- ============================================================
create table if not exists public.progress (
  user_id       uuid references auth.users (id) on delete cascade,
  content_id    text not null,
  completed     boolean default false,
  updated_at    timestamptz default now(),
  primary key (user_id, content_id)
);

-- ============================================================
-- 4. Tabla: mastered_concepts (conceptos dominados por el usuario)
-- ============================================================
create table if not exists public.mastered_concepts (
  user_id       uuid references auth.users (id) on delete cascade,
  concept_id    text not null,
  mastered_at   timestamptz default now(),
  primary key (user_id, concept_id)
);

-- ============================================================
-- 5. Row Level Security (RLS): cada usuario solo ve/edita sus datos
-- ============================================================
alter table public.profiles enable row level security;
alter table public.interactions enable row level security;
alter table public.progress enable row level security;
alter table public.mastered_concepts enable row level security;

-- profiles: el usuario gestiona su propio perfil
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- interactions: el usuario gestiona sus interacciones
create policy "interactions_select_own" on public.interactions
  for select using (auth.uid() = user_id);
create policy "interactions_insert_own" on public.interactions
  for insert with check (auth.uid() = user_id);

-- progress: el usuario gestiona su progreso
create policy "progress_select_own" on public.progress
  for select using (auth.uid() = user_id);
create policy "progress_insert_own" on public.progress
  for insert with check (auth.uid() = user_id);
create policy "progress_update_own" on public.progress
  for update using (auth.uid() = user_id);

-- mastered_concepts: el usuario gestiona sus conceptos dominados
create policy "mastered_select_own" on public.mastered_concepts
  for select using (auth.uid() = user_id);
create policy "mastered_insert_own" on public.mastered_concepts
  for insert with check (auth.uid() = user_id);
create policy "mastered_delete_own" on public.mastered_concepts
  for delete using (auth.uid() = user_id);

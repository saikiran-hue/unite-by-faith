-- ============================================================================
-- 0005 — Identity: private profile fields (owner-only via RLS)
-- Birth date, gender and match preferences live here, never in public.profiles.
-- Existing *_insert_own / *_update_own policies on profiles, user_tags and
-- pod_members already compare against (select auth.uid()), so they are untouched.
-- ============================================================================

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  gender text check (gender in ('man', 'woman')),
  age_min smallint check (age_min >= 18),
  age_max smallint,
  max_distance_km smallint not null default 25,
  only_my_tradition boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint profile_private_age_range check (age_max is null or age_min is null or age_max >= age_min)
);

alter table public.profile_private enable row level security;

create policy "profile_private_select_own"
  on public.profile_private for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "profile_private_insert_own"
  on public.profile_private for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "profile_private_update_own"
  on public.profile_private for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

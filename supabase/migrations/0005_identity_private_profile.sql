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

-- ============================================================================
-- Demo flag is server-only. profiles_insert_own / profiles_update_own let a
-- signed-in user write any column of their own row, which would let them mark
-- themselves as a demo account (demo accounts only match demo accounts). A
-- column REVOKE does nothing against the table-level grant, so a trigger pins
-- the flag for the API roles; service_role and postgres are unaffected.
-- ============================================================================
create or replace function public.pin_is_demo_account()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo_account := false;
    else
      new.is_demo_account := old.is_demo_account;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_pin_is_demo_account on public.profiles;
create trigger profiles_pin_is_demo_account
  before insert or update on public.profiles
  for each row execute function public.pin_is_demo_account();

-- ============================================================================
-- Demo sign-in fix. GoTrue fails with "Database error querying schema" when a
-- user row has NULL token columns, and the 0002 seed inserted the demo users
-- that way. 0002 is already applied on hosted and never re-runs, so fix here.
-- ============================================================================
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, '')
where email like '%@unitebyfaith.org';

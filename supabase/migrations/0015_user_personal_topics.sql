-- 0015: Personal topics. Things a member is into, typed freely (e.g. "World War 2", "Learning English").
-- Matched person to person by meaning: the server stores a gte-small embedding of each label (null when the
-- model failed; the next save tries again) and compares members' topics in the app layer.
-- Matches can see them, so any signed-in member may read; signed-out visitors may not.
-- No browser write policies: the server writes with the service role, through replace_user_personal_topics.
-- Safe to run more than once.

create table if not exists public.user_personal_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 2 and 40),
  embedding extensions.vector(384),
  created_at timestamptz not null default now()
);

create unique index if not exists user_personal_topics_user_label_key
  on public.user_personal_topics (user_id, lower(btrim(label)));

alter table public.user_personal_topics enable row level security;

drop policy if exists "user_personal_topics_select_authenticated" on public.user_personal_topics;
create policy "user_personal_topics_select_authenticated"
  on public.user_personal_topics for select
  to authenticated
  using (true);

-- Replace a member's personal topics in one transaction. rows: [{label, embedding}], embedding a
-- '[x,y,...]' string or null. A null embedding keeps the one already stored for the same label, if any.
create or replace function public.replace_user_personal_topics(uid uuid, rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept jsonb;
begin
  -- Serialise concurrent saves for the same member (e.g. a double submit). Key 15: not 0014's lock.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 15));
  select coalesce(jsonb_object_agg(lower(btrim(t.label)), t.embedding::text), '{}'::jsonb)
    into kept
    from public.user_personal_topics t
   where t.user_id = uid and t.embedding is not null;
  delete from public.user_personal_topics where user_id = uid;
  -- created_at steps by a microsecond per row so reads ordered by created_at keep the member's order.
  insert into public.user_personal_topics (user_id, label, embedding, created_at)
  select uid, r->>'label',
         coalesce((r->>'embedding')::extensions.vector(384),
                  (kept->>lower(btrim(r->>'label')))::extensions.vector(384)),
         now() + make_interval(secs => e.n / 1000000.0)
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) with ordinality as e(r, n);
end;
$$;
revoke execute on function public.replace_user_personal_topics(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_user_personal_topics(uuid, jsonb) to service_role;

-- 0014: "Add your own" habits. A member's own words show on their profile; on save the server maps each one
-- to up to 2 close catalogue habits in the same category (mapped_slugs), which matching treats as implied picks.
-- Own habits are free text, so each member can read only their own rows (app reads use the service role).
-- No browser write policies: the server writes with the service role, through replace_user_custom_tags.
-- Also adds an optional category filter to the tag search functions, applied before the limit.
-- Safe to run more than once.

create table if not exists public.user_custom_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('faith', 'hobbies', 'tastes', 'skills')),
  label text not null check (char_length(btrim(label)) between 2 and 40),
  mapped_slugs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists user_custom_tags_user_category_label_key
  on public.user_custom_tags (user_id, category, lower(btrim(label)));

alter table public.user_custom_tags enable row level security;

drop policy if exists "user_custom_tags_select_authenticated" on public.user_custom_tags;
drop policy if exists "user_custom_tags_select_own" on public.user_custom_tags;
create policy "user_custom_tags_select_own"
  on public.user_custom_tags for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Replace a member's own habits in one transaction. rows: [{category, label, mapped_slugs}].
create or replace function public.replace_user_custom_tags(uid uuid, rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise concurrent saves for the same member (e.g. a double submit).
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 14));
  delete from public.user_custom_tags where user_id = uid;
  insert into public.user_custom_tags (user_id, category, label, mapped_slugs)
  select uid, r->>'category', r->>'label',
         coalesce(array(select jsonb_array_elements_text(r->'mapped_slugs')), '{}')
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) as r;
end;
$$;
revoke execute on function public.replace_user_custom_tags(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_user_custom_tags(uuid, jsonb) to service_role;

-- Tag search with an optional category, filtered before the limit ------------------------
-- Drop the old signatures first: adding a defaulted argument would otherwise create an overload,
-- and calls with only q would be ambiguous.
drop function if exists public.search_tags_text(text);
drop function if exists public.search_tags_text(text, text);
create function public.search_tags_text(q text, cat text default null)
returns table (slug text, score real)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.slug, s.score
  from (
    select t.slug,
           greatest(
             extensions.similarity(lower(t.label), lower(q)),
             coalesce((select max(extensions.similarity(lower(syn), lower(q)))
                       from unnest(t.synonyms) as syn), 0)
           )::real as score
    from public.taxonomy_tags t
    where t.is_active and (cat is null or t.category = cat)
  ) s
  where s.score > 0
  order by s.score desc, s.slug
  limit 8
$$;
grant execute on function public.search_tags_text(text, text) to anon, authenticated, service_role;

drop function if exists public.search_tags_vector(extensions.vector, int);
drop function if exists public.search_tags_vector(extensions.vector, int, text);
create function public.search_tags_vector(q extensions.vector(384), k int default 3, cat text default null)
returns table (slug text, cos real)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.slug, (1 - (t.embedding operator(extensions.<=>) q))::real as cos
  from public.taxonomy_tags t
  where t.is_active and t.embedding is not null and (cat is null or t.category = cat)
  order by t.embedding operator(extensions.<=>) q
  limit k
$$;
-- Same rule as 0012: not callable by anon.
revoke execute on function public.search_tags_vector(extensions.vector, int, text) from public, anon;
grant execute on function public.search_tags_vector(extensions.vector, int, text) to authenticated, service_role;

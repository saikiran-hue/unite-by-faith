-- 0009: stage-1 hard filters for the matching engine (mutual rules, in the database).
-- Stage 2 (TypeScript) scores the trimmed candidate list.

-- Great-circle distance in km ---------------------------------------------------
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371.0088 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- Per-rule flags for viewer vs every other onboarded, same-demo-ness profile --------
-- Internal helper. A missing field on either side fails that rule (fail closed).
-- ok_gender is the duo rule: same gender and both fellowship modes allow duos.
create or replace function public.match_rule_flags(viewer uuid)
returns table (
  cand uuid,
  ok_age boolean,
  ok_language boolean,
  ok_place boolean,
  ok_gender boolean,
  ok_tradition boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select p.id, p.languages, p.meet_mode, p.tradition_id, p.fellowship_mode, p.is_demo_account,
           pp.gender, pp.age_min, pp.age_max, pp.max_distance_km, pp.only_my_tradition,
           extract(year from age(current_date, pp.birth_date))::int as yrs,
           c.lat, c.lng,
           extract(epoch from (now() at time zone c.timezone) - (now() at time zone 'UTC')) / 60 as tz_min
    from public.profiles p
    join public.profile_private pp on pp.user_id = p.id
    left join public.cities c on c.id = p.location_city_id
    where p.id = viewer and p.onboarding_completed
  ),
  o as (
    select p.id, p.languages, p.meet_mode, p.tradition_id, p.fellowship_mode,
           pp.gender, pp.age_min, pp.age_max, pp.max_distance_km, pp.only_my_tradition,
           extract(year from age(current_date, pp.birth_date))::int as yrs,
           c.lat, c.lng,
           extract(epoch from (now() at time zone c.timezone) - (now() at time zone 'UTC')) / 60 as tz_min
    from public.profiles p
    join public.profile_private pp on pp.user_id = p.id
    left join public.cities c on c.id = p.location_city_id
    where p.onboarding_completed
      and p.id <> viewer
      and p.is_demo_account = (select is_demo_account from v)
  )
  select
    o.id,
    coalesce(
      v.yrs is not null and o.yrs is not null
      and v.age_min is not null and v.age_max is not null
      and o.age_min is not null and o.age_max is not null
      and o.yrs between v.age_min and v.age_max
      and v.yrs between o.age_min and o.age_max, false),
    coalesce(v.languages && o.languages, false),
    coalesce(
      (v.meet_mode in ('in_person', 'both') and o.meet_mode in ('in_person', 'both')
        and v.lat is not null and o.lat is not null
        and public.haversine_km(v.lat, v.lng, o.lat, o.lng)
            <= least(v.max_distance_km, o.max_distance_km))
      or
      (v.meet_mode in ('online', 'both') and o.meet_mode in ('online', 'both')
        and v.tz_min is not null and o.tz_min is not null
        and abs(v.tz_min - o.tz_min) <= 180), false),
    coalesce(
      v.gender is not null and o.gender is not null and v.gender = o.gender
      and v.fellowship_mode in ('both', 'duo_only')
      and o.fellowship_mode in ('both', 'duo_only'), false),
    case when v.only_my_tradition or o.only_my_tradition
         then coalesce(v.tradition_id = o.tradition_id, false)
         else true end
  from v cross join o
$$;

-- Number of viewer tags equal to, or a neighbour of, any tag in `slugs` --------------
create or replace function public.match_pre_rank(viewer uuid, slugs text[])
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.user_tags vt
  where vt.user_id = viewer
    and (vt.tag_slug = any (slugs)
         or exists (select 1 from public.tag_neighbors n
                    where n.tag_a = vt.tag_slug and n.tag_b = any (slugs)))
$$;

-- Duo candidates -------------------------------------------------------------------
create or replace function public.match_candidates(viewer uuid, kind text, lim int default 300)
returns table (user_id uuid, pre_rank int)
language sql
stable
security definer
set search_path = ''
as $$
  select f.cand, public.match_pre_rank(viewer, coalesce(
           (select array_agg(t.tag_slug) from public.user_tags t where t.user_id = f.cand), '{}'))
  from public.match_rule_flags(viewer) f
  where kind = 'duo'
    and f.ok_age and f.ok_language and f.ok_place and f.ok_gender and f.ok_tradition
  order by 2 desc, 1
  limit lim
$$;

-- Pod candidates ---------------------------------------------------------------------
-- Gender is not applied. The viewer must pass age/language/place/tradition against every
-- member (a member who is not onboarded or is a different demo-ness fails closed).
create or replace function public.match_pod_candidates(viewer uuid, lim int default 100)
returns table (pod_id uuid, pre_rank int)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select cand from public.match_rule_flags(viewer)
    where ok_age and ok_language and ok_place and ok_tradition
  )
  select pd.id, public.match_pre_rank(viewer, pd.anchor_tags)
  from public.pods pd
  where pd.status not in ('full', 'archived')
    and pd.member_count < pd.max_members
    and exists (select 1 from public.profiles vp
                where vp.id = viewer and vp.onboarding_completed
                  and vp.fellowship_mode in ('both', 'group_only'))
    and not exists (select 1 from public.pod_members pm
                    where pm.pod_id = pd.id and pm.user_id = viewer)
    and not exists (select 1 from public.pod_members pm
                    where pm.pod_id = pd.id
                      and pm.user_id not in (select cand from f))
  order by 2 desc, 1
  limit lim
$$;

-- Per-rule pass counts (for the "narrowest rule" empty state) -------------------------
-- Counts people (eligible = onboarded, same demo-ness, not self) passing each single rule.
-- For kind = 'pods' the gender rule is not applied, so its row reports the eligible total.
create or replace function public.match_filter_counts(viewer uuid, kind text)
returns table (rule text, passing int)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (select * from public.match_rule_flags(viewer))
  select 'age', (select count(*) filter (where ok_age) from f)::int
  union all select 'language', (select count(*) filter (where ok_language) from f)::int
  union all select 'place', (select count(*) filter (where ok_place) from f)::int
  union all select 'gender',
    (select case when kind = 'pods' then count(*) else count(*) filter (where ok_gender) end from f)::int
  union all select 'tradition', (select count(*) filter (where ok_tradition) from f)::int
$$;

-- Tag search by text -----------------------------------------------------------------
create or replace function public.search_tags_text(q text)
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
    where t.is_active
  ) s
  where s.score > 0
  order by s.score desc, s.slug
  limit 8
$$;
grant execute on function public.search_tags_text(text) to anon, authenticated, service_role;

-- Tag search by meaning (query vector is a raw gte-small embedding, compared with the raw column) ---
create or replace function public.search_tags_vector(q extensions.vector(384), k int default 3)
returns table (slug text, cos real)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.slug, (1 - (t.embedding operator(extensions.<=>) q))::real as cos
  from public.taxonomy_tags t
  where t.is_active and t.embedding is not null
  order by t.embedding operator(extensions.<=>) q
  limit k
$$;
grant execute on function public.search_tags_vector(extensions.vector, int) to authenticated, service_role;

-- Lock down the security definer functions ---------------------------------------------
revoke execute on function public.match_rule_flags(uuid) from public, anon, authenticated;
revoke execute on function public.match_pre_rank(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.match_candidates(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.match_pod_candidates(uuid, int) from public, anon, authenticated;
revoke execute on function public.match_filter_counts(uuid, text) from public, anon, authenticated;
grant execute on function public.match_rule_flags(uuid) to service_role;
grant execute on function public.match_pre_rank(uuid, text[]) to service_role;
grant execute on function public.match_candidates(uuid, text, int) to service_role;
grant execute on function public.match_pod_candidates(uuid, int) to service_role;
grant execute on function public.match_filter_counts(uuid, text) to service_role;

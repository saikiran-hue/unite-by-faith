-- 0011: demo seed for matching engine v2.
-- Brings the 8 demo profiles from 0002 up to date so every demo viewer gets real duo and
-- group results: life fit fields, profile_private rows, faith-first tag levels, and a few
-- related-tag pairs (hiking/trail-running, guitar/piano, book-club/classic-literature).
-- Idempotent: updates the demo rows in place and upserts; touches only the 8 demo ids.
-- Gender split is 4 men + 4 women, so each viewer has 3 same-gender duo candidates.
-- No new auth users are needed (the 0002 users keep their password and token fix from 0005).

do $$
declare
  ids uuid[] := array[
    '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111104',
    '11111111-1111-4111-8111-111111111105', '11111111-1111-4111-8111-111111111106',
    '11111111-1111-4111-8111-111111111107', '11111111-1111-4111-8111-111111111108'];
begin
  -- Life fit on profiles. City ids are GeoNames ids from public.cities.
  update public.profiles p set
    is_demo_account = true,
    onboarding_completed = true,
    languages = v.languages,
    location_city_id = v.city_id,
    location_city = coalesce(v.city_label, p.location_city),
    meet_mode = v.meet_mode,
    life_stage = v.life_stage,
    availability = v.availability,
    tradition_id = v.tradition_id,
    faith_stage = v.faith_stage
  from (values
    -- id, languages, city_id, city_label, meet_mode, life_stage, availability, tradition, faith_stage
    (ids[1], array['en','ml'], 1277333, null, 'both',      'established_career', array['weekday_evening','weekend_morning'],                 'non-denominational', 'mature'),
    (ids[2], array['en','te'], 1277333, 'Bengaluru, IN', 'both', 'established_career', array['weekday_evening','weekend_morning','weekend_afternoon'], 'reformed', 'mature'),
    (ids[3], array['en','ta'], 1264527, null, 'both',      'early_career',       array['weekday_evening','weekend_afternoon'],               'non-denominational', 'growing'),
    (ids[4], array['en','hi'], 1259229, 'Pune, IN',      'both', 'early_career', array['weekday_evening','weekend_morning'],                 'baptist', 'growing'),
    (ids[5], array['en','hi'], 1259229, null, 'both',      'married_no_kids',    array['weekday_morning','weekend_morning','weekend_afternoon'], 'charismatic', 'mature'),
    (ids[6], array['en','ml'], 1277333, null, 'both',      'established_career', array['weekday_evening','weekend_afternoon'],               'anglican', 'mature'),
    (ids[7], array['en','ml'], 1273874, null, 'both',      'early_career',       array['weekday_morning','weekend_morning'],                 'non-denominational', 'growing'),
    (ids[8], array['en','hi'], 1261481, null, 'both',      'early_career',       array['weekday_evening','weekend_morning'],                 'csi', 'growing')
  ) as v(id, languages, city_id, city_label, meet_mode, life_stage, availability, tradition_id, faith_stage)
  where p.id = v.id;

  -- Private fields. Four men, four women; wide age ranges so demo viewers see each other.
  insert into public.profile_private (user_id, birth_date, gender, age_min, age_max, max_distance_km, only_my_tradition)
  values
    (ids[1], date '1991-03-14', 'man',   25, 45, 50, false),
    (ids[2], date '1993-07-02', 'woman', 25, 45, 50, false),
    (ids[3], date '1996-11-21', 'man',   22, 42, 50, false),
    (ids[4], date '1997-05-09', 'woman', 22, 42, 50, false),
    (ids[5], date '1989-09-30', 'man',   25, 45, 50, false),
    (ids[6], date '1992-01-17', 'woman', 25, 45, 50, false),
    (ids[7], date '1995-06-25', 'man',   22, 42, 50, false),
    (ids[8], date '1998-12-03', 'woman', 22, 42, 50, false)
  on conflict (user_id) do update set
    birth_date = excluded.birth_date, gender = excluded.gender,
    age_min = excluded.age_min, age_max = excluded.age_max,
    max_distance_km = excluded.max_distance_km, only_my_tradition = excluded.only_my_tradition,
    updated_at = now();

  -- Extra tags that form related (not identical) pairs. Category comes from the catalogue.
  insert into public.user_tags (user_id, tag_slug, category, is_priority, level)
  select x.uid, x.slug, t.category, false, x.lvl
  from (values
    (ids[7], 'trail-running',      2),  -- Joshua <-> Micah's hiking
    (ids[4], 'piano-and-keyboard', 2),  -- Abigail <-> Hannah's guitar
    (ids[8], 'classic-literature', 2),  -- Rebecca <-> Hannah's / Lydia's book-club
    (ids[3], 'board-games',        1)   -- Daniel <-> Caleb's chess
  ) as x(uid, slug, lvl)
  join public.taxonomy_tags t on t.slug = x.slug
  on conflict (user_id, tag_slug) do update set level = excluded.level;

  -- Levels: priority picks are 3, faith picks are at least 2, one casual pick per person is 1.
  update public.user_tags set level = 3 where user_id = any (ids) and is_priority;
  update public.user_tags set level = 3
    where user_id = any (ids) and category = 'faith'
      and tag_slug in ('daily-bible-study', 'worship-ministry', 'intercessory-prayer', 'apologetics', 'discipleship');
  update public.user_tags set level = 1
    where user_id = any (ids)
      and tag_slug in ('specialty-coffee', 'group-hangouts', 'night-owl', 'lo-fi-and-focus-music', 'cooking', 'gym-training');
end $$;

-- Same sign-in fix as 0005, in case a future seed adds users with NULL token columns.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, '')
where email like '%@unitebyfaith.org';

-- 0006: matching engine v2 schema (cities, traditions, tag metadata, weights, events).

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Reference data -----------------------------------------------------------
create table if not exists public.cities (
  id int primary key,
  name text not null,
  country_code char(2) not null,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  population int not null default 0
);
create index if not exists idx_cities_name_trgm
  on public.cities using gin (name extensions.gin_trgm_ops);

create table if not exists public.traditions (
  id text primary key,
  name text not null,
  family text not null default '',
  sort_order int not null default 0
);

-- profiles -----------------------------------------------------------------
alter table public.profiles
  add column if not exists languages text[] not null default '{}',
  add column if not exists location_city_id int references public.cities(id),
  add column if not exists meet_mode text not null default 'both'
    check (meet_mode in ('in_person','online','both')),
  add column if not exists life_stage text
    check (life_stage in ('student','early_career','established_career','married_no_kids','parent_young_kids','parent_older_kids')),
  add column if not exists availability text[] not null default '{}',
  add column if not exists tradition_id text references public.traditions(id),
  add column if not exists faith_stage text
    check (faith_stage in ('exploring','new_believer','growing','mature'));

-- taxonomy_tags ------------------------------------------------------------
alter table public.taxonomy_tags
  add column if not exists subgroup text not null default '',
  add column if not exists synonyms text[] not null default '{}',
  add column if not exists embedding extensions.vector(384),
  add column if not exists popularity int not null default 0,
  add column if not exists is_active boolean not null default true;
create index if not exists idx_taxonomy_tags_label_trgm
  on public.taxonomy_tags using gin (label extensions.gin_trgm_ops);

-- user_tags ----------------------------------------------------------------
alter table public.user_tags
  add column if not exists level smallint not null default 2 check (level between 1 and 3);

-- New tables ---------------------------------------------------------------
create table if not exists public.tag_neighbors (
  tag_a text not null,
  tag_b text not null,
  sim real not null,
  source text not null check (source in ('model','curated')),
  primary key (tag_a, tag_b)
);

create table if not exists public.tag_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  query text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_weights (
  version int primary key,
  is_active boolean not null default false,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('duo','pod')),
  target_id uuid not null,
  event text not null check (event in ('shown','connected','joined','replied','active_7d','left_pod')),
  score smallint,
  breakdown jsonb,
  weights_version int references public.match_weights(version),
  created_at timestamptz not null default now()
);
create index if not exists idx_match_events_viewer_created
  on public.match_events (viewer_id, created_at);
-- One row per outcome per viewer and target; `shown` may repeat.
create unique index if not exists uq_match_events_outcome
  on public.match_events (viewer_id, target_id, event) where event <> 'shown';

insert into public.match_weights (version, is_active, config) values (
  1, true,
  '{"version":1,
    "total":{"faith":0.40,"interests":0.35,"life":0.25},
    "faith":{"tags":0.60,"tradition":0.25,"stage":0.15},
    "interests":{"hobbies":0.40,"tastes":0.35,"skills":0.25},
    "life":{"stage":0.35,"availability":0.35,"place":0.15,"age":0.15},
    "pod":{"min":0.5,"mean":0.3,"anchor":0.2},
    "neighborMin":0.25,
    "relatedCap":0.7,
    "onlineTzMaxMin":180}'::jsonb
) on conflict (version) do nothing;

-- Popularity trigger -------------------------------------------------------
create or replace function public.maintain_tag_popularity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT') then
    update public.taxonomy_tags set popularity = popularity + 1 where slug = new.tag_slug;
  elsif tg_op = 'DELETE' then
    update public.taxonomy_tags set popularity = greatest(popularity - 1, 0) where slug = old.tag_slug;
  elsif tg_op = 'UPDATE' and new.tag_slug is distinct from old.tag_slug then
    update public.taxonomy_tags set popularity = greatest(popularity - 1, 0) where slug = old.tag_slug;
    update public.taxonomy_tags set popularity = popularity + 1 where slug = new.tag_slug;
  end if;
  return null;
end;
$$;
revoke execute on function public.maintain_tag_popularity() from public, anon, authenticated;

drop trigger if exists trg_user_tags_popularity on public.user_tags;
create trigger trg_user_tags_popularity
  after insert or delete or update of tag_slug on public.user_tags
  for each row execute function public.maintain_tag_popularity();

update public.taxonomy_tags t
set popularity = c.n
from (select tag_slug, count(*)::int as n from public.user_tags group by tag_slug) c
where t.slug = c.tag_slug;

-- RLS ----------------------------------------------------------------------
alter table public.cities enable row level security;
alter table public.traditions enable row level security;
alter table public.tag_neighbors enable row level security;
alter table public.tag_requests enable row level security;
alter table public.match_weights enable row level security;
alter table public.match_events enable row level security;

create policy "cities_select_all" on public.cities for select using (true);
create policy "traditions_select_all" on public.traditions for select using (true);
create policy "tag_neighbors_select_all" on public.tag_neighbors for select using (true);
-- tag_requests, match_weights, match_events: no policies = service role only.
-- taxonomy_tags already has taxonomy_tags_select_all (0001).

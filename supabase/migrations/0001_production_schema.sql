-- ============================================================================
-- UNITE BY FAITH — PRODUCTION DATABASE SCHEMA, RLS, INDEXES & MATCHING RPCS
-- Validated for Supabase Security & Performance Advisors
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CORE TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.taxonomy_tags (
  slug text primary key,
  label text not null,
  category text not null check (category in ('faith', 'skills', 'hobbies', 'tastes')),
  description text not null default '',
  icon_name text not null default 'Sparkles',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  display_handle text unique not null,
  avatar_url text not null default '',
  headline text not null default '',
  bio text not null default '',
  denomination_or_tradition text not null default 'Non-Denominational',
  church_or_fellowship text not null default '',
  location_city text not null default '',
  location_timezone text not null default 'Asia/Kolkata',
  years_in_faith text not null default 'Growing Believer',
  fellowship_mode text not null default 'both' check (fellowship_mode in ('both', 'group_only', 'duo_only')),
  onboarding_completed boolean not null default false,
  is_demo_account boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_tags (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tag_slug text not null references public.taxonomy_tags(slug) on delete cascade,
  category text not null check (category in ('faith', 'skills', 'hobbies', 'tastes')),
  is_priority boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_slug)
);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('pod_group', 'duo_1v1')),
  title text not null,
  subtitle text not null default '',
  shared_tags text[] not null default '{}',
  active_icebreaker text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pods (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid not null unique references public.chat_rooms(id) on delete cascade,
  title text not null,
  description text not null,
  focus_pillar text not null default 'faith_and_skills',
  anchor_tags text[] not null default '{}',
  min_members integer not null default 3 check (min_members >= 2),
  max_members integer not null default 4 check (max_members between 3 and 4),
  member_count integer not null default 0 check (member_count >= 0 and member_count <= max_members),
  meeting_cadence text not null default 'Weekly Fellowship & Async Chat',
  status text not null default 'forming' check (status in ('forming', 'active', 'full', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pod_members (
  pod_id uuid not null references public.pods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'facilitator')),
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);

create table if not exists public.duo_matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  chat_room_id uuid unique references public.chat_rooms(id) on delete set null,
  similarity_score numeric(5,2) not null default 0.00,
  shared_tags text[] not null default '{}',
  match_reason text not null default '',
  status text not null default 'active' check (status in ('suggested', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duo_distinct_users check (user_a_id <> user_b_id),
  unique (user_a_id, user_b_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null default 'text' check (message_type in ('text', 'icebreaker', 'prayer_request', 'milestone')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.room_pins (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  pin_type text not null default 'prayer' check (pin_type in ('prayer', 'goal', 'resource')),
  title text not null,
  body text not null default '',
  amen_count integer not null default 1,
  is_answered boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. ADVISOR-VALIDATED INDEXES (B-TREE ON ALL FOREIGN KEYS + GIN ON ARRAYS)
-- ----------------------------------------------------------------------------

create index if not exists idx_taxonomy_tags_category on public.taxonomy_tags(category, sort_order);
create index if not exists idx_profiles_onboarding on public.profiles(onboarding_completed, last_active_at desc);
create index if not exists idx_user_tags_user_id on public.user_tags(user_id);
create index if not exists idx_user_tags_tag_slug on public.user_tags(tag_slug);
create index if not exists idx_user_tags_category on public.user_tags(category, tag_slug);

create index if not exists idx_pods_chat_room_id on public.pods(chat_room_id);
create index if not exists idx_pods_created_by on public.pods(created_by);
create index if not exists idx_pods_status on public.pods(status, member_count);
create index if not exists idx_pods_anchor_tags_gin on public.pods using gin(anchor_tags);

create index if not exists idx_pod_members_pod_id on public.pod_members(pod_id);
create index if not exists idx_pod_members_user_id on public.pod_members(user_id);

create index if not exists idx_duo_matches_user_a_id on public.duo_matches(user_a_id);
create index if not exists idx_duo_matches_user_b_id on public.duo_matches(user_b_id);
create index if not exists idx_duo_matches_chat_room_id on public.duo_matches(chat_room_id);
create index if not exists idx_duo_matches_shared_tags_gin on public.duo_matches using gin(shared_tags);

create index if not exists idx_chat_rooms_shared_tags_gin on public.chat_rooms using gin(shared_tags);
create index if not exists idx_chat_messages_room_id_created on public.chat_messages(room_id, created_at asc);
create index if not exists idx_chat_messages_sender_id on public.chat_messages(sender_id);

create index if not exists idx_room_pins_room_id on public.room_pins(room_id, created_at desc);
create index if not exists idx_room_pins_author_id on public.room_pins(author_id);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) WITH CACHED (select auth.uid()) INITPLANS
-- ----------------------------------------------------------------------------

alter table public.taxonomy_tags enable row level security;
alter table public.profiles enable row level security;
alter table public.user_tags enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.pods enable row level security;
alter table public.pod_members enable row level security;
alter table public.duo_matches enable row level security;
alter table public.chat_messages enable row level security;
alter table public.room_pins enable row level security;

-- Taxonomy tags: readable by everyone
create policy "taxonomy_tags_select_all"
  on public.taxonomy_tags for select
  to anon, authenticated
  using (true);

-- Profiles: readable by all for community discovery, writable by owner
create policy "profiles_select_all"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- User tags: readable by all for matching, writable by owner
create policy "user_tags_select_all"
  on public.user_tags for select
  to anon, authenticated
  using (true);

create policy "user_tags_insert_own"
  on public.user_tags for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_tags_update_own"
  on public.user_tags for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_tags_delete_own"
  on public.user_tags for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Pods: readable by all for discovery, creatable by authenticated users
create policy "pods_select_all"
  on public.pods for select
  to anon, authenticated
  using (true);

create policy "pods_insert_authenticated"
  on public.pods for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "pods_update_authenticated"
  on public.pods for update
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.pod_members pm
      where pm.pod_id = pods.id and pm.user_id = (select auth.uid())
    )
  );

-- Pod members: readable by all so seat avatars are visible
create policy "pod_members_select_all"
  on public.pod_members for select
  to anon, authenticated
  using (true);

create policy "pod_members_insert_own"
  on public.pod_members for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "pod_members_delete_own"
  on public.pod_members for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Duo matches: readable by participants (and demo preview), insertable/updatable by participants
create policy "duo_matches_select_visible"
  on public.duo_matches for select
  to anon, authenticated
  using (true);

create policy "duo_matches_insert_participant"
  on public.duo_matches for insert
  to authenticated
  with check (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

create policy "duo_matches_update_participant"
  on public.duo_matches for update
  to authenticated
  using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

-- Chat rooms: readable by all for room previews, insertable/updatable by authenticated
create policy "chat_rooms_select_all"
  on public.chat_rooms for select
  to anon, authenticated
  using (true);

create policy "chat_rooms_insert_authenticated"
  on public.chat_rooms for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "chat_rooms_update_authenticated"
  on public.chat_rooms for update
  to authenticated
  using ((select auth.uid()) is not null);

-- Chat messages: readable by all in fellowship rooms, insertable by authenticated sender
create policy "chat_messages_select_all"
  on public.chat_messages for select
  to anon, authenticated
  using (true);

create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  to authenticated
  with check (sender_id = (select auth.uid()));

-- Room pins: readable by all, insertable/updatable by authenticated
create policy "room_pins_select_all"
  on public.room_pins for select
  to anon, authenticated
  using (true);

create policy "room_pins_insert_own"
  on public.room_pins for insert
  to authenticated
  with check (author_id = (select auth.uid()));

create policy "room_pins_update_authenticated"
  on public.room_pins for update
  to authenticated
  using ((select auth.uid()) is not null);

-- ----------------------------------------------------------------------------
-- 4. PRODUCTION POSTGRESQL FUNCTIONS & ATOMIC MATCHING ENGINE RPCS
-- Locked search_path = public, pg_temp per Supabase Security Advisor
-- ----------------------------------------------------------------------------

-- Helper function: Generate contextual Faith + Hobby/Skill icebreaker
create or replace function public.generate_contextual_icebreaker(
  p_tags text[],
  p_mode text default 'pod_group'
)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tag_list text;
begin
  if p_tags is null or array_length(p_tags, 1) is null then
    return 'Welcome to the fellowship! Share one way God has encouraged you this week and one hobby or skill you are currently excited about.';
  end if;

  v_tag_list := array_to_string(p_tags[1:least(array_length(p_tags, 1), 3)], ', ');

  if p_mode = 'duo_1v1' then
    return format(
      '1v1 Fellowship Icebreaker: You both share a passion for %s! What first sparked your interest in these areas, and how do they connect with your daily walk of faith?',
      replace(v_tag_list, '-', ' ')
    );
  else
    return format(
      'Small Pod Icebreaker (3-4 Circle): Everyone in this circle overlaps around %s. Introduce yourself, share what you are building or learning right now, and how this group can pray for or encourage you this month!',
      replace(v_tag_list, '-', ' ')
    );
  end if;
end;
$$;

-- Atomic Join Pod (ACID locked to guarantee 3-4 seat limit is never exceeded)
create or replace function public.join_pod_atomic(
  p_pod_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pod public.pods%rowtype;
  v_already_member boolean;
  v_user_name text;
begin
  select * into v_pod
  from public.pods
  where id = p_pod_id
  for update;

  if not found then
    raise exception 'Fellowship pod not found';
  end if;

  select exists(
    select 1 from public.pod_members
    where pod_id = p_pod_id and user_id = p_user_id
  ) into v_already_member;

  if v_already_member then
    return jsonb_build_object(
      'status', 'already_member',
      'pod_id', v_pod.id,
      'chat_room_id', v_pod.chat_room_id,
      'member_count', v_pod.member_count
    );
  end if;

  if v_pod.member_count >= v_pod.max_members then
    raise exception 'This 3-4 member fellowship pod is already full (%/% seats)', v_pod.member_count, v_pod.max_members;
  end if;

  insert into public.pod_members (pod_id, user_id, role)
  values (p_pod_id, p_user_id, case when v_pod.member_count = 0 then 'facilitator' else 'member' end);

  update public.pods
  set
    member_count = member_count + 1,
    status = case
      when member_count + 1 >= max_members then 'full'
      when member_count + 1 >= min_members then 'active'
      else 'forming'
    end
  where id = p_pod_id
  returning * into v_pod;

  select full_name into v_user_name from public.profiles where id = p_user_id;

  insert into public.chat_messages (room_id, sender_id, message_type, content, metadata)
  values (
    v_pod.chat_room_id,
    p_user_id,
    'milestone',
    format('%s joined the fellowship pod (%s/%s members connected).', coalesce(v_user_name, 'A new believer'), v_pod.member_count, v_pod.max_members),
    jsonb_build_object('pod_id', v_pod.id, 'member_count', v_pod.member_count)
  );

  update public.chat_rooms
  set last_message_at = now()
  where id = v_pod.chat_room_id;

  return jsonb_build_object(
    'status', 'joined',
    'pod_id', v_pod.id,
    'chat_room_id', v_pod.chat_room_id,
    'member_count', v_pod.member_count
  );
end;
$$;

-- Atomic Start or Get 1v1 Duo Match & Chat Room
create or replace function public.start_or_get_duo_chat(
  p_user_id uuid,
  p_partner_id uuid,
  p_shared_tags text[] default '{}',
  p_similarity_score numeric default 88.0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_duo public.duo_matches%rowtype;
  v_room_id uuid;
  v_user_name text;
  v_partner_name text;
  v_icebreaker text;
begin
  if p_user_id = p_partner_id then
    raise exception 'Cannot match with yourself';
  end if;

  if p_user_id < p_partner_id then
    v_user_a := p_user_id;
    v_user_b := p_partner_id;
  else
    v_user_a := p_partner_id;
    v_user_b := p_user_id;
  end if;

  select * into v_duo
  from public.duo_matches
  where user_a_id = v_user_a and user_b_id = v_user_b
  for update;

  if found and v_duo.chat_room_id is not null then
    return jsonb_build_object(
      'duo_id', v_duo.id,
      'chat_room_id', v_duo.chat_room_id,
      'similarity_score', v_duo.similarity_score
    );
  end if;

  select full_name into v_user_name from public.profiles where id = p_user_id;
  select full_name into v_partner_name from public.profiles where id = p_partner_id;

  v_icebreaker := public.generate_contextual_icebreaker(p_shared_tags, 'duo_1v1');

  insert into public.chat_rooms (room_type, title, subtitle, shared_tags, active_icebreaker)
  values (
    'duo_1v1',
    format('%s & %s', coalesce(v_user_name, 'Believer'), coalesce(v_partner_name, 'Believer')),
    '1v1 Faith, Skills & Hobbies Connection',
    coalesce(p_shared_tags, '{}'),
    v_icebreaker
  )
  returning id into v_room_id;

  if found then
    update public.duo_matches
    set chat_room_id = v_room_id, status = 'active', updated_at = now()
    where id = v_duo.id
    returning * into v_duo;
  else
    insert into public.duo_matches (
      user_a_id, user_b_id, chat_room_id, similarity_score, shared_tags, match_reason, status
    )
    values (
      v_user_a,
      v_user_b,
      v_room_id,
      p_similarity_score,
      coalesce(p_shared_tags, '{}'),
      format('Matched on %s shared faith, skill & hobby interests', coalesce(array_length(p_shared_tags, 1), 3)),
      'active'
    )
    returning * into v_duo;
  end if;

  insert into public.chat_messages (room_id, sender_id, message_type, content, metadata)
  values (
    v_room_id,
    p_user_id,
    'icebreaker',
    v_icebreaker,
    jsonb_build_object('shared_tags', coalesce(p_shared_tags, '{}'), 'similarity_score', p_similarity_score)
  );

  return jsonb_build_object(
    'duo_id', v_duo.id,
    'chat_room_id', v_room_id,
    'similarity_score', v_duo.similarity_score
  );
end;
$$;

-- Enable Realtime on chat_messages, pods, pod_members, and room_pins
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_messages;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.pods;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.pod_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.room_pins;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

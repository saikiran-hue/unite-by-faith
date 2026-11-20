-- 0016: WhatsApp-style chat base: replies, edits, deletes, reactions, read state, typing auth.
-- All writes go through the server (service role); the browser only reads what it is a member of.
-- Re-runnable.

-- 1. Columns on chat_messages --------------------------------------------------------------
alter table public.chat_messages
  add column if not exists reply_to_id uuid null references public.chat_messages(id) on delete set null,
  add column if not exists edited_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

-- 2. Tables --------------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  emoji text null check (emoji is null or emoji in ('🙏','❤️','👍','😂','🙌')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists idx_message_reactions_room_id on public.message_reactions(room_id);

create table if not exists public.room_reads (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (room_id, user_id)
);

alter table public.message_reactions enable row level security;
alter table public.room_reads enable row level security;

drop policy if exists "message_reactions_select_member" on public.message_reactions;
create policy "message_reactions_select_member"
  on public.message_reactions for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "room_reads_select_member" on public.room_reads;
create policy "room_reads_select_member"
  on public.room_reads for select
  to authenticated
  using (public.is_room_member(room_id));

-- 3. Realtime publication ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.message_reactions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.room_reads;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 4. unread_counts -------------------------------------------------------------------------
create or replace function public.unread_counts(p_user uuid)
returns table(room_id uuid, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select p.chat_room_id as room_id, pm.joined_at as since
    from public.pod_members pm
    join public.pods p on p.id = pm.pod_id
    where pm.user_id = p_user
    union
    select d.chat_room_id, d.created_at
    from public.duo_matches d
    where p_user in (d.user_a_id, d.user_b_id)
      and d.chat_room_id is not null
  )
  select r.room_id, count(*)::int as unread
  from r
  left join public.room_reads rr on rr.room_id = r.room_id and rr.user_id = p_user
  join public.chat_messages m on m.room_id = r.room_id
  where m.created_at > greatest(coalesce(rr.last_read_at, r.since), r.since)
    and m.sender_id <> p_user
    and m.deleted_at is null
  group by r.room_id
  having count(*) > 0
$$;

-- 5. delete_chat_message -------------------------------------------------------------------
create or replace function public.delete_chat_message(p_message uuid, p_user uuid, p_room uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.chat_messages%rowtype;
begin
  select * into m
  from public.chat_messages
  where id = p_message and room_id = p_room
  for update;

  if not found then
    return 'message_not_found';
  end if;
  if m.sender_id <> p_user then
    return 'not_your_message';
  end if;
  if m.deleted_at is not null then
    return 'message_deleted';
  end if;

  if m.message_type in ('prayer_request', 'milestone')
     and (m.metadata->>'pin_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    delete from public.room_pins
    where id = (m.metadata->>'pin_id')::uuid
      and author_id = p_user
      and room_id = p_room;
  end if;

  update public.message_reactions set emoji = null where message_id = p_message;

  update public.chat_messages
  set deleted_at = now(), content = '', metadata = '{}'::jsonb
  where id = p_message;

  return 'ok';
end;
$$;

-- 6. react_to_message ----------------------------------------------------------------------
create or replace function public.react_to_message(p_message uuid, p_user uuid, p_room uuid, p_emoji text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.chat_messages%rowtype;
begin
  if p_emoji is not null and p_emoji not in ('🙏','❤️','👍','😂','🙌') then
    return 'invalid_emoji';
  end if;

  select * into m
  from public.chat_messages
  where id = p_message and room_id = p_room
  for share;

  if not found then
    return 'message_not_found';
  end if;
  if m.deleted_at is not null then
    return 'message_deleted';
  end if;

  insert into public.message_reactions (message_id, user_id, room_id, emoji)
  values (p_message, p_user, p_room, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji;

  return 'ok';
end;
$$;

-- 7. mark_room_read ------------------------------------------------------------------------
create or replace function public.mark_room_read(p_room uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.room_reads (room_id, user_id, last_read_at)
  values (p_room, p_user, now())
  on conflict (room_id, user_id)
  do update set last_read_at = greatest(public.room_reads.last_read_at, now())
$$;

revoke execute on function public.unread_counts(uuid) from public, anon, authenticated;
revoke execute on function public.delete_chat_message(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.react_to_message(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_room_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unread_counts(uuid) to service_role;
grant execute on function public.delete_chat_message(uuid, uuid, uuid) to service_role;
grant execute on function public.react_to_message(uuid, uuid, uuid, text) to service_role;
grant execute on function public.mark_room_read(uuid, uuid) to service_role;

-- 8. Backfill: everyone starts fully read --------------------------------------------------
insert into public.room_reads (room_id, user_id, last_read_at)
select p.chat_room_id, pm.user_id, now()
from public.pod_members pm
join public.pods p on p.id = pm.pod_id
on conflict do nothing;

insert into public.room_reads (room_id, user_id, last_read_at)
select d.chat_room_id, u.user_id, now()
from public.duo_matches d
cross join lateral (values (d.user_a_id), (d.user_b_id)) as u(user_id)
where d.chat_room_id is not null
on conflict do nothing;

-- 9. Realtime Authorization (typing broadcast on topic room:<uuid>) ------------------------
drop policy if exists "room_members_receive_broadcast" on realtime.messages;
create policy "room_members_receive_broadcast"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (case when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then public.is_room_member(substring(realtime.topic() from 6)::uuid) else false end)
  );

drop policy if exists "room_members_send_broadcast" on realtime.messages;
create policy "room_members_send_broadcast"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (case when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then public.is_room_member(substring(realtime.topic() from 6)::uuid) else false end)
  );

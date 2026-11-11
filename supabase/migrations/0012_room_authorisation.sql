-- 0012: chats, pins and pod seats are for room members only.
-- 0001 let anon read every chat, any user update any pin, add themselves to any pod and call
-- the seat/duo RPCs for someone else. All app writes go through the server (service role), so
-- the browser keeps only what it uses: member-scoped SELECT on chat_messages and room_pins for
-- the Realtime subscription on the room page. Re-runnable.

-- Membership helper ----------------------------------------------------------------------
-- Security definer so policies do not recurse into pod_members / duo_matches RLS.
create or replace function public.is_room_member(room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
      from public.pods p
      join public.pod_members pm on pm.pod_id = p.id
      where p.chat_room_id = room and pm.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.duo_matches d
      where d.chat_room_id = room
        and (select auth.uid()) in (d.user_a_id, d.user_b_id)
    )
$$;
revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

-- Seat and duo RPCs: server only (they trust p_user_id) --------------------------------------
revoke execute on function public.join_pod_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_or_get_duo_chat(uuid, uuid, text[], numeric) from public, anon, authenticated;
grant execute on function public.join_pod_atomic(uuid, uuid) to service_role;
grant execute on function public.start_or_get_duo_chat(uuid, uuid, text[], numeric) to service_role;

-- chat_messages ----------------------------------------------------------------------------
drop policy if exists "chat_messages_select_all" on public.chat_messages;
drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member"
  on public.chat_messages for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
drop policy if exists "chat_messages_insert_member" on public.chat_messages;
create policy "chat_messages_insert_member"
  on public.chat_messages for insert
  to authenticated
  with check (sender_id = (select auth.uid()) and public.is_room_member(room_id));

-- room_pins --------------------------------------------------------------------------------
drop policy if exists "room_pins_select_all" on public.room_pins;
drop policy if exists "room_pins_select_member" on public.room_pins;
create policy "room_pins_select_member"
  on public.room_pins for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "room_pins_insert_own" on public.room_pins;
drop policy if exists "room_pins_insert_member" on public.room_pins;
create policy "room_pins_insert_member"
  on public.room_pins for insert
  to authenticated
  with check (author_id = (select auth.uid()) and public.is_room_member(room_id));

drop policy if exists "room_pins_update_authenticated" on public.room_pins;
drop policy if exists "room_pins_update_member" on public.room_pins;
create policy "room_pins_update_member"
  on public.room_pins for update
  to authenticated
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id));

-- chat_rooms -------------------------------------------------------------------------------
-- Rooms are created by the server and the duo RPC only.
drop policy if exists "chat_rooms_select_all" on public.chat_rooms;
drop policy if exists "chat_rooms_select_member" on public.chat_rooms;
create policy "chat_rooms_select_member"
  on public.chat_rooms for select
  to authenticated
  using (public.is_room_member(id));

drop policy if exists "chat_rooms_insert_authenticated" on public.chat_rooms;

drop policy if exists "chat_rooms_update_authenticated" on public.chat_rooms;
drop policy if exists "chat_rooms_update_member" on public.chat_rooms;
create policy "chat_rooms_update_member"
  on public.chat_rooms for update
  to authenticated
  using (public.is_room_member(id))
  with check (public.is_room_member(id));

-- duo_matches ------------------------------------------------------------------------------
-- Writes would let a user point a duo row at someone else's room and pass is_room_member.
drop policy if exists "duo_matches_select_visible" on public.duo_matches;
drop policy if exists "duo_matches_select_participant" on public.duo_matches;
create policy "duo_matches_select_participant"
  on public.duo_matches for select
  to authenticated
  using ((select auth.uid()) in (user_a_id, user_b_id));

drop policy if exists "duo_matches_insert_participant" on public.duo_matches;
drop policy if exists "duo_matches_update_participant" on public.duo_matches;

-- pods / pod_members -----------------------------------------------------------------------
-- Seats are taken through join_pod_atomic (server) only; pod rows are written by the server.
-- A direct insert skipped the seat limit, and a pod update could repoint chat_room_id.
drop policy if exists "pod_members_insert_own" on public.pod_members;
drop policy if exists "pods_insert_authenticated" on public.pods;
drop policy if exists "pods_update_authenticated" on public.pods;

-- Pairwise eligibility for Connect / Join (same rules as match_candidates / match_pod_candidates,
-- but for one target, so the 300 / 100 caps never matter). Server only.
create or replace function public.duo_pair_allowed(viewer uuid, other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select f.ok_age and f.ok_language and f.ok_place and f.ok_gender and f.ok_tradition
    from public.match_rule_flags(viewer) f
    where f.cand = other
  ), false)
$$;

-- Pod rule: the viewer allows groups and passes age/language/place/tradition against every
-- member. Seat limits stay with join_pod_atomic, which reports a full pod by name.
create or replace function public.pod_join_allowed(viewer uuid, pod uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select cand from public.match_rule_flags(viewer)
    where ok_age and ok_language and ok_place and ok_tradition
  )
  select exists (
    select 1
    from public.pods pd
    where pd.id = pod
      and pd.status <> 'archived'
      and exists (select 1 from public.profiles vp
                  where vp.id = viewer and vp.onboarding_completed
                    and vp.fellowship_mode in ('both', 'group_only'))
      and not exists (select 1 from public.pod_members pm
                      where pm.pod_id = pd.id
                        and pm.user_id not in (select cand from f))
  )
$$;

revoke execute on function public.duo_pair_allowed(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pod_join_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.duo_pair_allowed(uuid, uuid) to service_role;
grant execute on function public.pod_join_allowed(uuid, uuid) to service_role;

-- Rolled-back check for migration 0017. Run with psql -v ON_ERROR_STOP=1.
-- start_or_get_duo_chat creates the duo and posts its opening Conversation Starter in one
-- transaction, so both carry the same now(). This whole script is one transaction too.
begin;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'chk17-a@example.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'chk17-b@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, display_handle) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'Check Starter', 'chk17_a'),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'Check Partner', 'chk17_b');

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000011';
  b constant uuid := 'aaaaaaaa-0000-4000-8000-000000000012';
  room uuid;
  since timestamptz;
  n int;
begin
  -- A taps Connect: the real path, duo row and starter message together.
  room := (public.start_or_get_duo_chat(a, b) ->> 'chat_room_id')::uuid;
  select created_at into since from public.duo_matches where chat_room_id = room;
  assert (select count(*) from public.chat_messages where room_id = room and sender_id = a
            and message_type = 'icebreaker' and created_at = since) = 1,
    'the opening starter should share the duo''s created_at';
  assert not exists (select 1 from public.room_reads where room_id = room),
    'a new duo has no room_reads rows yet';

  -- The partner has never opened the chat: the starter counts.
  select unread into n from public.unread_counts(b) where room_id = room;
  assert n = 1, 'partner should see the opening starter as unread, got ' || coalesce(n::text, 'null');
  -- The sender never counts their own message.
  assert not exists (select 1 from public.unread_counts(a) where room_id = room),
    'starter must not be unread for its sender';

  -- Read at exactly the starter's time: read marks stay exclusive.
  insert into public.room_reads (room_id, user_id, last_read_at) values (room, b, since);
  assert not exists (select 1 from public.unread_counts(b) where room_id = room),
    'a read mark equal to created_at covers the message';

  -- A stale read mark from before the duo began: the starter counts again.
  update public.room_reads set last_read_at = since - interval '1 hour' where room_id = room and user_id = b;
  select unread into n from public.unread_counts(b) where room_id = room;
  assert n = 1, 'stale read mark: starter should count, got ' || coalesce(n::text, 'null');
end $$;

rollback;

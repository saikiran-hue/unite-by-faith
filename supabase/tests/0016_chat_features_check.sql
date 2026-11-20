-- Rolled-back check for migration 0016. Run with psql -v ON_ERROR_STOP=1.
begin;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'chk-a@example.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'chk-b@example.test', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, display_handle) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Check A', 'chk_a'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Check B', 'chk_b');
insert into public.chat_rooms (id, room_type, title) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'duo_1v1', 'check room');
insert into public.duo_matches (user_a_id, user_b_id, chat_room_id, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000001', now() - interval '1 hour');
insert into public.room_pins (id, room_id, author_id, title) values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'pray');
insert into public.chat_messages (id, room_id, sender_id, message_type, content, metadata, created_at) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'text', 'hi from A', '{}', now() - interval '50 minutes'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000002', 'text', 'hi from B', '{}', now() - interval '40 minutes'),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'prayer_request', 'please pray',
   '{"pin_id":"dddddddd-0000-4000-8000-000000000001"}', now() - interval '30 minutes'),
  ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000002', 'text', 'B text with A pin id',
   '{"pin_id":"dddddddd-0000-4000-8000-000000000001"}', now() - interval '20 minutes');

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  room constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  m_prayer constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  m_btext constant uuid := 'cccccccc-0000-4000-8000-000000000004';
  pin constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  n int;
  t1 timestamptz;
  t2 timestamptz;
  t3 timestamptz;
begin
  -- unread: A sees only B's two messages; B sees only A's two
  select unread into n from public.unread_counts(a) where room_id = room;
  assert n = 2, 'unread_counts(A) should be 2, got ' || coalesce(n::text, 'null');
  select unread into n from public.unread_counts(b) where room_id = room;
  assert n = 2, 'unread_counts(B) should be 2, got ' || coalesce(n::text, 'null');

  assert public.react_to_message(m_btext, a, room, '🔥') = 'invalid_emoji', 'bad emoji';
  assert public.react_to_message(m_btext, a, room, '🙏') = 'ok', 'good emoji';

  -- B deleting its own text must leave A's pin
  assert public.delete_chat_message(m_btext, b, room) = 'ok', 'B deletes own text';
  assert exists (select 1 from public.room_pins where id = pin), 'pin must survive B delete';
  assert (select emoji from public.message_reactions where message_id = m_btext and user_id = a) is null,
    'reactions cleared on delete';

  assert public.delete_chat_message(m_prayer, b, room) = 'not_your_message', 'B cannot delete A prayer';
  assert public.delete_chat_message(m_prayer, a, room) = 'ok', 'A deletes prayer';
  assert (select content from public.chat_messages where id = m_prayer) = '', 'content wiped';
  assert (select metadata from public.chat_messages where id = m_prayer) = '{}'::jsonb, 'metadata wiped';
  assert (select deleted_at from public.chat_messages where id = m_prayer) is not null, 'deleted_at set';
  assert not exists (select 1 from public.room_pins where id = pin), 'pin removed';
  assert public.delete_chat_message(m_prayer, a, room) = 'message_deleted', 'double delete';
  assert public.react_to_message(m_prayer, b, room, '🙏') = 'message_deleted', 'react on deleted';
  assert public.react_to_message(gen_random_uuid(), b, room, '🙏') = 'message_not_found', 'react missing';

  -- deleted messages no longer count as unread
  select unread into n from public.unread_counts(b) where room_id = room;
  assert n = 1, 'unread_counts(B) after delete should be 1, got ' || coalesce(n::text, 'null');

  -- mark_room_read never moves backwards
  perform public.mark_room_read(room, a);
  select last_read_at into t1 from public.room_reads where room_id = room and user_id = a;
  perform public.mark_room_read(room, a);
  select last_read_at into t2 from public.room_reads where room_id = room and user_id = a;
  assert t2 >= t1, 'last_read_at moved backwards';
  update public.room_reads set last_read_at = now() + interval '1 day' where room_id = room and user_id = a;
  select last_read_at into t3 from public.room_reads where room_id = room and user_id = a;
  perform public.mark_room_read(room, a);
  assert (select last_read_at from public.room_reads where room_id = room and user_id = a) = t3,
    'mark_room_read moved last_read_at backwards';
  assert not exists (select 1 from public.unread_counts(a) where room_id = room), 'A fully read';
end $$;

rollback;

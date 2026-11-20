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

insert into public.chat_rooms (id, room_type, title) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'duo_1v1', 'other room');
insert into public.chat_messages (id, room_id, sender_id, message_type, content, metadata) values
  ('cccccccc-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000002', 'prayer_request', 'B prayer with A pin',
   '{"pin_id":"dddddddd-0000-4000-8000-000000000001"}'),
  ('cccccccc-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000002',
   'aaaaaaaa-0000-4000-8000-000000000002', 'text', 'in other room', '{}');
-- Message 5 is a third unread message from B for A. Message 6 is in another room, so it never counts.

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  room constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  m_prayer constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  m_btext constant uuid := 'cccccccc-0000-4000-8000-000000000004';
  m_bprayer constant uuid := 'cccccccc-0000-4000-8000-000000000005';
  other_msg constant uuid := 'cccccccc-0000-4000-8000-000000000006';
  pin constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  n int;
  t3 timestamptz;
begin
  -- unread: A counts B's three messages in this room (2, 4, 5); B counts A's two (1, 3)
  select unread into n from public.unread_counts(a) where room_id = room;
  assert n = 3, 'unread_counts(A) should be 3, got ' || coalesce(n::text, 'null');
  select unread into n from public.unread_counts(b) where room_id = room;
  assert n = 2, 'unread_counts(B) should be 2, got ' || coalesce(n::text, 'null');

  assert public.react_to_message(m_btext, a, room, '🔥') = 'invalid_emoji', 'bad emoji';
  assert public.react_to_message(m_btext, a, room, '🙏') = 'ok', 'good emoji';
  assert exists (select 1 from public.message_reactions where message_id = m_btext and user_id = a and emoji = '🙏'),
    'reaction row inserted';
  assert public.react_to_message(m_btext, a, room, '❤️') = 'ok', 'change emoji';
  assert (select count(*) from public.message_reactions where message_id = m_btext and user_id = a) = 1
    and (select emoji from public.message_reactions where message_id = m_btext and user_id = a) = '❤️',
    'emoji changed in place';
  assert public.react_to_message(m_btext, a, room, null) = 'ok', 'toggle off';
  assert exists (select 1 from public.message_reactions where message_id = m_btext and user_id = a and emoji is null),
    'toggle off keeps the row with a null emoji';
  assert public.react_to_message(m_btext, a, room, '🙏') = 'ok', 'react again';

  -- missing and cross-room ids
  assert public.delete_chat_message(gen_random_uuid(), a, room) = 'message_not_found', 'delete missing';
  assert public.delete_chat_message(other_msg, b, room) = 'message_not_found', 'delete cross-room';
  assert public.react_to_message(other_msg, a, room, '🙏') = 'message_not_found', 'react cross-room';
  assert public.delete_chat_message(m_btext, null, room) = 'not_your_message', 'null user fails closed';
  assert (select deleted_at from public.chat_messages where id = m_btext) is null, 'null user wiped nothing';

  -- B deleting its own text must leave A's pin
  assert public.delete_chat_message(m_btext, b, room) = 'ok', 'B deletes own text';
  assert exists (select 1 from public.room_pins where id = pin), 'pin must survive B delete';
  assert exists (select 1 from public.message_reactions where message_id = m_btext and user_id = a and emoji is null),
    'reaction row kept with emoji cleared on delete';

  -- B prayer carrying A's pin id: ok, but A's pin stays (author guard)
  assert public.delete_chat_message(m_bprayer, b, room) = 'ok', 'B deletes own prayer';
  assert exists (select 1 from public.room_pins where id = pin), 'pin must survive B prayer delete';

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

  -- mark_room_read clears A's unread (B's text from 40 minutes ago is still unread here)
  assert exists (select 1 from public.unread_counts(a) where room_id = room), 'A has unread before marking';
  perform public.mark_room_read(room, a);
  assert not exists (select 1 from public.unread_counts(a) where room_id = room),
    'mark_room_read should clear A''s unread';

  -- mark_room_read never moves backwards
  perform public.mark_room_read(room, a);
  -- Put A's mark a day ahead: the next mark_room_read stamps now(), which must not pull it back.
  update public.room_reads set last_read_at = now() + interval '1 day' where room_id = room and user_id = a;
  select last_read_at into t3 from public.room_reads where room_id = room and user_id = a;
  perform public.mark_room_read(room, a);
  assert (select last_read_at from public.room_reads where room_id = room and user_id = a) = t3,
    'mark_room_read moved last_read_at backwards';

  -- since lower bound: a stale room_reads row must not count messages from before the duo began
  insert into public.chat_messages (room_id, sender_id, content, created_at)
  values (room, b, 'before duo', now() - interval '2 hours');
  update public.room_reads set last_read_at = now() - interval '3 hours' where room_id = room and user_id = a;
  select unread into n from public.unread_counts(a) where room_id = room;
  assert n = 1, 'since bound: expected 1 unread (pre-duo and deleted excluded), got ' || coalesce(n::text, 'null');
end $$;

rollback;

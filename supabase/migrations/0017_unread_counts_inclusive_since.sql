-- 0017: unread_counts counts a message sent at the very instant the reader joined.
-- start_or_get_duo_chat (0004) inserts the duo and its opening Conversation Starter in one
-- transaction, so both carry the same now(). 0016 counted only `created_at > since`, which left
-- that starter out of the partner's badge. Now a message counts from `since` inclusive (as the
-- client's isSeen does) and stays exclusive of the reader's own read mark. Re-runnable.

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
  where m.created_at >= r.since
    and (rr.last_read_at is null or m.created_at > rr.last_read_at)
    and m.sender_id <> p_user
    and m.deleted_at is null
  group by r.room_id
  having count(*) > 0
$$;

revoke execute on function public.unread_counts(uuid) from public, anon, authenticated;
grant execute on function public.unread_counts(uuid) to service_role;

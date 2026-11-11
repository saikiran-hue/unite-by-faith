-- Fix start_or_get_duo_chat FOUND state before chat_rooms insert
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
  v_duo_exists boolean;
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

  v_duo_exists := found;

  if v_duo_exists and v_duo.chat_room_id is not null then
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

  if v_duo_exists then
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

-- Fix routine volatility classification for Supabase db lint advisor
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

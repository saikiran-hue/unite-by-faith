-- 0010: city search for the Life fit picker (trigram, top 8). Local verification only until the owner approves it for the hosted project.
create or replace function public.search_cities(q text)
returns table (id int, name text, country_code text, score real)
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (select left(q, 60) as q)
  select c.id, c.name, c.country_code::text,
         greatest(
           extensions.similarity(lower(c.name), lower(p.q)),
           case when lower(c.name) like replace(replace(replace(lower(p.q), '\', '\\'), '%', '\%'), '_', '\_') || '%' then 0.9 else 0 end
         )::real as score
  from public.cities c, p
  where c.name operator(extensions.%) p.q
     or lower(c.name) like replace(replace(replace(lower(p.q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by score desc, c.population desc, c.id
  limit 8
$$;
grant execute on function public.search_cities(text) to authenticated, service_role;
revoke execute on function public.search_cities(text) from public, anon;

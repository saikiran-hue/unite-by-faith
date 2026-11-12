-- 0014: "Add your own" habits. A member's own words show on their profile; on save the server maps each one
-- to up to 2 close catalogue habits in the same category (mapped_slugs), which matching treats as implied picks.
-- Signed-in users can read (same rule as user_tags in 0013). No browser write policies: the server writes
-- with the service role.
-- Safe to run more than once.

create table if not exists public.user_custom_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('faith', 'hobbies', 'tastes', 'skills')),
  label text not null check (char_length(btrim(label)) between 2 and 40),
  mapped_slugs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists user_custom_tags_user_category_label_key
  on public.user_custom_tags (user_id, category, lower(btrim(label)));

alter table public.user_custom_tags enable row level security;

drop policy if exists "user_custom_tags_select_authenticated" on public.user_custom_tags;
create policy "user_custom_tags_select_authenticated"
  on public.user_custom_tags for select
  to authenticated
  using (true);

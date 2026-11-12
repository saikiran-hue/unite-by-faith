-- 0013: people, their habits, groups and group members are readable by signed-in users only (owner decision 2026-11-12).
-- 0001 let anon read these with using (true), so anyone holding the public key could list who is in which group.
-- App reads go through the service-role client; the browser only uses Realtime with the user's token, so nothing breaks.
-- taxonomy_tags stays public: it is the habit catalogue, not personal data.
-- Safe to run more than once.

drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "user_tags_select_all" on public.user_tags;
drop policy if exists "user_tags_select_authenticated" on public.user_tags;
create policy "user_tags_select_authenticated"
  on public.user_tags for select
  to authenticated
  using (true);

drop policy if exists "pods_select_all" on public.pods;
drop policy if exists "pods_select_authenticated" on public.pods;
create policy "pods_select_authenticated"
  on public.pods for select
  to authenticated
  using (true);

drop policy if exists "pod_members_select_all" on public.pod_members;
drop policy if exists "pod_members_select_authenticated" on public.pod_members;
create policy "pod_members_select_authenticated"
  on public.pod_members for select
  to authenticated
  using (true);

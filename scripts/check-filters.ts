/**
 * Asserts the stage-1 hard filters (migration 0009) against the local Supabase database.
 * Seeds a throwaway fixture inside a transaction that is always rolled back.
 *
 *   npx supabase db reset && npx tsx scripts/check-filters.ts
 */
import { spawnSync } from "node:child_process";

const U = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  V: U(1), good: U(2), age: U(3), lang: U(4), far: U(5), woman: U(6), trad: U(7),
  demo: U(8), W: U(9), o5: U(10), o2: U(11),
};
const POD = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CHAT = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// mk(n, id, name, demo, gender, age_years, langs, city, mode, trad, only_trad)
const fixture = `
create function pg_temp.mk(id uuid, nm text, demo boolean, gender text, yrs int, langs text[],
  city int, mode text, trad text, only_trad boolean) returns void language plpgsql as $f$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    nm || '@fixture.test', 'x', now(), now(), now(), '{}', '{}');
  insert into public.profiles (id, full_name, display_handle, onboarding_completed, is_demo_account,
    languages, location_city_id, meet_mode, tradition_id)
  values (id, nm, nm, true, demo, langs, city, mode, trad);
  insert into public.profile_private (user_id, birth_date, gender, age_min, age_max, max_distance_km, only_my_tradition)
  values (id, current_date - make_interval(years => yrs) - interval '10 days', gender, 25, 35, 25, only_trad);
end $f$;

-- isolate: nobody but the fixture is onboarded
update public.profiles set onboarding_completed = false;

insert into public.cities (id, name, country_code, lat, lng, timezone) values
  (-1, 'A', 'IN', 10.0, 76.0, 'Asia/Kolkata'),
  (-2, 'B30', 'IN', 10.27, 76.0, 'Asia/Kolkata'),   -- about 30 km from A
  (-3, 'Dubai', 'AE', 25.2, 55.3, 'Asia/Dubai'),
  (-4, 'Tokyo', 'JP', 35.7, 139.7, 'Asia/Tokyo'),   -- 5 h from Dubai
  (-5, 'Dhaka', 'BD', 23.8, 90.4, 'Asia/Dhaka');    -- 2 h from Dubai

select pg_temp.mk('${ids.V}', 'fx-viewer', false, 'man', 30, '{en}', -1, 'in_person', 'csi', true);
select pg_temp.mk('${ids.good}', 'fx-good', false, 'man', 30, '{en}', -1, 'in_person', 'csi', false);
select pg_temp.mk('${ids.age}', 'fx-age', false, 'man', 50, '{en}', -1, 'in_person', 'csi', false);
select pg_temp.mk('${ids.lang}', 'fx-lang', false, 'man', 30, '{ml}', -1, 'in_person', 'csi', false);
select pg_temp.mk('${ids.far}', 'fx-far', false, 'man', 30, '{en}', -2, 'in_person', 'csi', false);
select pg_temp.mk('${ids.woman}', 'fx-woman', false, 'woman', 30, '{en}', -1, 'in_person', 'csi', false);
select pg_temp.mk('${ids.trad}', 'fx-trad', false, 'man', 30, '{en}', -1, 'in_person', 'cni', false);
select pg_temp.mk('${ids.demo}', 'fx-demo', true, 'man', 30, '{en}', -1, 'in_person', 'csi', false);
select pg_temp.mk('${ids.W}', 'fx-online', false, 'man', 30, '{en}', -3, 'online', 'csi', false);
select pg_temp.mk('${ids.o5}', 'fx-tz5', false, 'man', 30, '{en}', -4, 'online', 'csi', false);
select pg_temp.mk('${ids.o2}', 'fx-tz2', false, 'man', 30, '{en}', -5, 'online', 'csi', false);

-- pods: ok (good), mixed (woman), badage (good + 50-year-old), full (good)
insert into public.chat_rooms (id, room_type, title) values
  ('${CHAT(1)}','pod_group','ok'),('${CHAT(2)}','pod_group','mixed'),
  ('${CHAT(3)}','pod_group','badage'),('${CHAT(4)}','pod_group','full');
insert into public.pods (id, chat_room_id, title, description, max_members, member_count, status, anchor_tags) values
  ('${POD(1)}','${CHAT(1)}','ok','', 4, 1, 'forming', '{}'),
  ('${POD(2)}','${CHAT(2)}','mixed','', 4, 1, 'forming', '{}'),
  ('${POD(3)}','${CHAT(3)}','badage','', 4, 2, 'forming', '{}'),
  ('${POD(4)}','${CHAT(4)}','full','', 4, 4, 'full', '{}');
insert into public.pod_members (pod_id, user_id) values
  ('${POD(1)}','${ids.good}'),('${POD(2)}','${ids.woman}'),
  ('${POD(3)}','${ids.good}'),('${POD(3)}','${ids.age}'),('${POD(4)}','${ids.good}');

-- pre_rank: viewer holds tag_a, the good candidate holds its neighbour tag_b
insert into public.user_tags (user_id, tag_slug, category)
  select '${ids.V}', n.tag_a, t.category from public.tag_neighbors n
  join public.taxonomy_tags t on t.slug = n.tag_a order by n.tag_a, n.tag_b limit 1;
insert into public.user_tags (user_id, tag_slug, category)
  select '${ids.good}', n.tag_b, t.category from public.tag_neighbors n
  join public.taxonomy_tags t on t.slug = n.tag_b order by n.tag_a, n.tag_b limit 1;

-- privilege check: authenticated must not execute match_candidates
do $$ begin
  set local role authenticated;
  perform public.match_candidates('${ids.V}', 'duo');
  perform set_config('fx.denied', 'no', true);
exception when insufficient_privilege then
  perform set_config('fx.denied', 'yes', true);
end $$;
reset role;
`;

const q = (key: string, sql: string) => `select '${key}' || '=' || coalesce((${sql}), 'NULL');`;
const duo = (v: string) =>
  `select coalesce(string_agg(user_id::text, ',' order by user_id), '') from public.match_candidates('${v}','duo')`;
const pods = (v: string) =>
  `select coalesce(string_agg(pod_id::text, ',' order by pod_id), '') from public.match_pod_candidates('${v}')`;
const counts = (k: string) =>
  `select string_agg(rule || ':' || passing, ',' order by rule) from public.match_filter_counts('${ids.V}','${k}')`;

const probes = [
  q("duoV", duo(ids.V)),
  q("duoW", duo(ids.W)),
  q("podsV", pods(ids.V)),
  q("preRankGood", `select pre_rank::text from public.match_candidates('${ids.V}','duo') where user_id='${ids.good}'`),
  q("countsDuo", counts("duo")),
  q("countsPods", counts("pods")),
  q("denied", `select current_setting('fx.denied')`),
  q("pairGood", `select public.duo_pair_allowed('${ids.V}','${ids.good}')::text`),
  q("pairWoman", `select public.duo_pair_allowed('${ids.V}','${ids.woman}')::text`),
  q("pairDemo", `select public.duo_pair_allowed('${ids.V}','${ids.demo}')::text`),
  q("joinOk", `select public.pod_join_allowed('${ids.V}','${POD(1)}')::text`),
  q("joinMixed", `select public.pod_join_allowed('${ids.V}','${POD(2)}')::text`),
  q("joinBadAge", `select public.pod_join_allowed('${ids.V}','${POD(3)}')::text`),
  q("searchTop", `select slug from public.search_tags_text('faith and work') limit 1`),
  q("searchCount", `select count(*)::text from public.search_tags_text('prayer')`),
  q("haversine", `select round(public.haversine_km(10.0,76.0,10.27,76.0))::text`),
];

const sql = `begin;\n${fixture}\n${probes.join("\n")}\nrollback;\n`;
const r = spawnSync(
  "docker",
  ["exec", "-i", "supabase_db_unite_by_faith", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
  { input: sql, encoding: "utf8" },
);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  console.error("FAIL  fixture / functions did not run (is migration 0009 applied?)");
  process.exit(1);
}
const got: Record<string, string> = {};
for (const line of r.stdout.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && /^[A-Za-z]+$/.test(line.slice(0, i))) got[line.slice(0, i)] = line.slice(i + 1);
}
const list = (...xs: string[]) => xs.sort().join(",");
const has = (key: string, id: string) => got[key]?.split(",").includes(id) ?? false;

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) failed++;
};

check("only the all-rules-passing candidate is a duo match", got.duoV === ids.good, got.duoV);
check("age range excludes", !has("duoV", ids.age));
check("no shared language excludes", !has("duoV", ids.lang));
check("30 km in-person with 25 km limit excludes", !has("duoV", ids.far));
check("both online with 5 h tz gap excludes", !has("duoW", ids.o5), got.duoW);
check("both online with 2 h tz gap passes", has("duoW", ids.o2), got.duoW);
check("duo of different gender excludes", !has("duoV", ids.woman));
check("same pair is allowed into a mixed pod", has("podsV", POD(2)), got.podsV);
check("only_my_tradition excludes a different tradition", !has("duoV", ids.trad));
check("demo vs real excludes", !has("duoV", ids.demo));
check("pod with a member failing the viewer's age range excludes", !has("podsV", POD(3)));
check("full pod excludes", !has("podsV", POD(4)));
check("pods returned are exactly ok + mixed", got.podsV === list(POD(1), POD(2)), got.podsV);
check("pre_rank counts neighbouring tags", got.preRankGood === "1", got.preRankGood);
check(
  "match_filter_counts (duo) returns 5 rule rows and the pool total",
  got.countsDuo === "age:8,gender:8,language:8,place:5,total:9,tradition:8",
  got.countsDuo,
);
check(
  "match_filter_counts (pods) reports total for gender and open pods of eligible people as total",
  got.countsPods === "age:8,gender:9,language:8,place:5,total:3,tradition:8",
  got.countsPods,
);
check("duo_pair_allowed: all-rules-passing pair", got.pairGood === "true", got.pairGood);
check("duo_pair_allowed: different gender rejected", got.pairWoman === "false", got.pairWoman);
check("duo_pair_allowed: demo vs real rejected", got.pairDemo === "false", got.pairDemo);
check("pod_join_allowed: ok pod", got.joinOk === "true", got.joinOk);
check("pod_join_allowed: mixed-gender pod", got.joinMixed === "true", got.joinMixed);
check("pod_join_allowed: a member fails the viewer's age range", got.joinBadAge === "false", got.joinBadAge);
check("authenticated cannot execute match_candidates", got.denied === "yes", got.denied);
check("search_tags_text finds exact label first", got.searchTop === "faith-and-work", got.searchTop);
check("search_tags_text returns at most 8 rows", Number(got.searchCount) >= 1 && Number(got.searchCount) <= 8, got.searchCount);
check("haversine_km ~30 km for 0.27 degrees latitude", got.haversine === "30", got.haversine);

process.exit(failed ? 1 : 0);

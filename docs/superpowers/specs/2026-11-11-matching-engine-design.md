# Matching Engine v2: Design

Date: 2026-11-11 · Status: draft for owner approval (builder-check questions resolved)

## 1. Intent

Unite by Faith helps Christians aged about 18–40 find real friends: one friend (1v1) or a pod of 3–4. The habits section and the matching behind it are the heart of the product, and today they are too thin to trust:

- 39 flat tags in 4 categories; two people only "share" a tag if they picked the exact same slug ("Hiking" and "Trail running" score as unrelated).
- Scores are padded (duos clamped to 52–99, pods to 60–99), so strangers look like good matches.
- `/api/state` loads every profile and every tag and scores them on every request; this cannot grow.
- Nothing about life fit (life stage, location, free time, language) is captured, so two perfectly "similar" people may never be able to meet.

The goal is an engine a systems engineer would respect: it captures the right signals, rules out impossible matches first, scores the rest with honest, explainable maths, and records outcomes so the weights can later be tuned on real data.

**A "perfect companion" (owner's decision)** = similar in faith practice and everyday interests **and** compatible in life (stage, place/timezone, free time, language). Overlap alone is not enough.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Layered input: a short fixed profile, category tag browsing showing the most popular ~12 first, and search over a large curated catalogue that maps typed words to the nearest tag.
2. Hard filters before any scoring: distance/timezone, age range, same gender for 1v1, shared language, plus an opt-in "only my tradition".
3. Honest scoring with semantic similarity between related tags, rarity weighting and per-tag intensity, shown as a real % with a Faith / Interests / Life fit breakdown and the top reasons.
4. Pod fit judged against every current member, not just the pod's chosen habits.
5. Outcome logging from day one (shown, connected, replied, kept chatting, left pod), not used for scoring yet.
6. Scoring moves server-side and scales to tens of thousands of profiles.

**Non-goals (this project)**
- Learning/adaptive weights (only the logging is built).
- Auto-forming new pods from unpodded users.
- Mentor/complementary pairing.
- Paid AI APIs or any third-party processing of user text.
- Leaving Supabase.

**Anti-goals (a failure even if it "works")**
- Reads like a dating app: no attractiveness, no swiping, no showing age or gender on cards.
- Tech/skills dominating matches; faith stays the strongest single factor.
- Inflated scores. A weak match must look weak.
- Matches nobody can explain. Every score must decompose into human reasons.
- User-invented free-text tags polluting the catalogue (typed words map to curated tags; unknown words are logged for curation, not created).
- Sensitive fields (birth date, gender, precise location) leaking to other users through the API.

## 3. Constraints

- Stack stays: Next.js 16.4.5 App Router (read `node_modules/next/dist/docs` before writing route code, per AGENTS.md), Supabase Postgres, existing soft-bento design system in `src/app/globals.css` and `src/components/ubf`. UI must follow that system exactly (light + dark, faith first, no emoji, existing radii).
- Owner rule: **every database migration, seed change or production setting needs the owner's explicit go-ahead before it is applied.** Write migrations as files; do not run them against the hosted project without approval. Same for any paid spend (there should be none).
- AI for tag similarity must be free and open-source and run on our own infrastructure (owner's decision).
- No test framework exists today; the project adds one (see §10).
- Demo accounts (`is_demo_account`) must keep working with the profile switcher, which becomes demo-only (see §3a).
- The hosted database currently holds only the 8 demo profiles and no real users (checked 2026-11-11). No data conversion is needed: the seed is rewritten.

## 3a. Phase 0: real identity (owner's decision: do this first)

Today `src/lib/session.ts` trusts a plain, unsigned `ubf_active_user_id` cookie, `/api/auth/switch` sets it to any profile id, and every route reads with the service-role client. Private fields cannot be protected on that basis. Before any matching work:
1. Use Supabase Auth sessions (`@supabase/ssr`, already a dependency) as the source of identity on the server; the user id comes from the verified session, never from a client-supplied value.
2. The profile switcher may only switch between `is_demo_account = true` profiles, and only into a demo session (e.g. signed demo credentials or a server-side demo sign-in), never into a real account.
3. Routes that act for the user use the user-scoped client where RLS can apply; the service role is kept for the matching RPC and admin jobs only.
4. RLS policies then protect the private fields in §9 for real.
Builder chooses the demo-session mechanism; it must not let anyone assume a non-demo identity.

## 4. What we capture from each user

### 4.1 Fixed profile ("Life fit"), new fields on `profiles`

| Field | Type | Used for | Visible to others? |
|---|---|---|---|
| `birth_date` | date | age filter + age closeness | No (never shown) |
| `gender` | `'man' \| 'woman'` | 1v1 same-gender filter | No |
| `age_min`, `age_max` | smallint, default own age ±6, `age_min` never below 18, no upper cap | hard filter (mutual) | No |
| `languages` | text[] (ISO 639-1), ≥1 | hard filter: share ≥1 | Yes |
| `location_city_id` | FK to a `cities` table (name, country, lat, lng, timezone); picked from the list only | distance + timezone | City name only |
| `meet_mode` | `'in_person' \| 'online' \| 'both'` | which distance rule applies | Yes |
| `max_distance_km` | smallint, default 25 | hard filter for in-person | No |
| `life_stage` | enum: `student`, `early_career`, `established_career`, `married_no_kids`, `parent_young_kids`, `parent_older_kids` | life-fit score | Yes |
| `availability` | text[] of slots: `{weekday,weekend} × {morning,afternoon,evening}` (6 slots) | life-fit score | Yes, as "Free: weekday evenings…" |
| `tradition_id` | FK to `traditions` (name, family) | faith score | Yes (already shown today) |
| `only_my_tradition` | boolean, default false | hard filter when true | No |
| `faith_stage` | enum: `exploring`, `new_believer`, `growing`, `mature` | faith score (closeness) | Yes |

Existing `denomination_or_tradition`, `location_city`, `location_timezone`, `years_in_faith` are migrated into the new FK/enum fields and then kept read-only for one release before removal (builder may decide timing).

**Age gate (owner's decision):** sign-up asks for birth date and refuses anyone under 18 with a plain message. People over 40 may join; age only affects who they match with.

**Cities (my call):** worldwide list from GeoNames `cities15000` (CC BY 4.0, attribution in the app's about/credits), one point per city. Because everyone in one city is 0 km apart, the place score and reasons treat "same city" as the top value ("Both in Pune"), and "x km apart" is shown only between different cities. Default `max_distance_km` 25 therefore means "my city and its near neighbours".

**Where it is collected:** the onboarding flow gains a "Life fit" step; Profile Details lets people edit it. Users without the required Life-fit fields can still browse but Search 1v1 / Search Groups prompt them to complete it first (same pattern as the existing "pick at least 3 habits" gate).

### 4.2 Interests (habits): curated catalogue

- **Categories stay four**: Faith Rhythms, Hobbies, Tastes, Tech & Skills, in that order.
- **Subgroups** inside each category for browsing (e.g. Hobbies → Outdoors, Sports, Creative, Music, Games, Food, Reading; Faith → Prayer, Scripture, Worship, Serving, Community, Learning).
- **Catalogue size**: roughly 300–400 curated tags at launch (my call; builder drafts, owner reviews the list before seeding).
- **New columns on `taxonomy_tags`**: `subgroup`, `synonyms text[]` (e.g. climbing ← bouldering, rock climbing), `embedding vector(384)`, `popularity int` (count of users holding it, refreshed by trigger or nightly job), `is_active bool`.
- **Per-user tag data (`user_tags`)**: add `level smallint` 1 = casual, 2 = regular, 3 = passionate (default 2). Keep `is_priority` (star), max 3 stars.
- **Limits**: min 3 tags to search (unchanged), max 30 total, at least 1 Faith tag recommended (soft nudge, not enforced).

### 4.3 How picking works on the Habits screen

1. Each category card opens on its **12 most popular** active tags (by `popularity`, ties by `sort_order`), plus "Show all" that reveals subgroups.
2. A **search box** across all categories:
   1. Instant match on label + synonyms (Postgres `pg_trgm`).
   2. If nothing scores above the trigram threshold, embed the query with the same model as the catalogue and return the nearest 3 tags by cosine similarity ("Did you mean Climbing?"). The user confirms; nothing is auto-picked.
   3. If still nothing (similarity below threshold), show "We don't have that yet" and log the query to `tag_requests` for curation.
3. A picked tag shows its level (tap to cycle casual → regular → passionate, or a small 3-step control; builder's call within the design system) and its star toggle.

## 5. Tag similarity (the "related interests" layer)

- **Model**: `gte-small` (384-dimension, open-source). It is the model Supabase Edge Functions provide built-in for free (`Supabase.ai.Session('gte-small')`) and is available for Node via `@huggingface/transformers` (`Xenova/gte-small`). Catalogue embeddings and query embeddings **must** use the same model.
- **Text embedded per tag**: `"{label}. {description}. Also: {synonyms}"`.
- **Precomputed neighbours**: a `tag_neighbors(tag_a, tag_b, sim)` table holding, for each tag, the top 10 other tags with cosine ≥ 0.60, symmetrical, **within the same category only** (so "Worship music" never counts as a hobby match). Recomputed whenever the catalogue changes (a script, not per request).
- **Curated overrides**: `tag_neighbors` rows can be edited by hand (a `source` column: `model | curated`); curated rows win.
- **Similarity used in scoring**: `s(a,b) = 1` if same tag; otherwise `sim` from `tag_neighbors` rescaled `(sim − 0.60) / 0.40 × 0.7` (so a related tag is worth at most 0.7 of an exact one); otherwise 0.

## 6. Matching pipeline

### 6.1 Stage 1: hard filters (SQL)

A Postgres function `match_candidates(viewer uuid, kind text, lim int default 300)` returns candidate user ids that pass **all** of these, checked **both ways** (both people's rules must allow the match):

1. `onboarding_completed`, not the viewer, not blocked (if a block list exists later).
2. Age: each person's age inside the other's `age_min..age_max`.
3. Language: `languages && languages` (array overlap).
4. Place:
   - both `in_person`: haversine distance ≤ both people's `max_distance_km`;
   - both `online`: timezone offset difference ≤ 3 hours;
   - `both` mode matches either rule; mixed `in_person` vs `online` passes only by the online rule if the in-person person is `both`, otherwise fails. Builder may simplify if the truth table proves awkward, but must document the final rule.
5. `kind = 'duo'`: same `gender`; also both `fellowship_mode` in (`both`, `duo_only`).
6. `only_my_tradition` on either side ⇒ same `tradition_id`.
7. Cheap pre-rank to trim to `lim`: number of shared or neighbouring tags (join on `user_tags` + `tag_neighbors`), so stage 2 never scores more than ~300 people.

8. Demo separation (owner's decision): demo accounts are matched only with demo accounts, and real accounts never see demo accounts (`is_demo_account` must be equal on both sides). Same rule for pods: demo pods only for demo viewers.

It runs as `security definer`, is callable only by the service role, and returns ids only.

**Pods** reuse the same rules: a pod is eligible only if the viewer passes stages 1.2–1.4 and 1.6 against **every** current member (gender is not applied to pods), the pod is not full and not archived, and the viewer's `fellowship_mode` allows groups.

### 6.2 Stage 2: scoring (server-side TypeScript)

Scoring runs in a pure, framework-free module (`src/lib/matching/score.ts`) on the server, called from the API route with the ≤300 candidates from stage 1. Owner's decision: filter and trim in the database, score in server code (never the browser). Reason: explainable, unit-testable maths, equally private and fast at this candidate count.

All component scores are 0–1. The final score is `round(100 × total)`, **no floors or ceilings**.

**Interest similarity I(A,B)** (used per category):
- Tag weight `w(t) = level(t) × (starred ? 1.5 : 1) × idf(t)`, `idf(t) = ln(1 + N / (1 + popularity(t)))`, N = active users.
- Directed coverage `C(A→B) = Σ_{a∈A} w(a)·max_{b∈B} s(a,b) / Σ_{a∈A} w(a)`.
- `I(A,B) = (C(A→B) + C(B→A)) / 2` (symmetric). Empty side ⇒ that category is excluded from the weighted mean, not scored 0.

**Faith F** = `0.60 × I_faithTags + 0.25 × T + 0.15 × S` where
- `T` tradition: same = 1, same family = 0.6, different family = 0.2 (`traditions.family` table; builder drafts families, owner reviews).
- `S` faith stage closeness: `1 − |Δ| / 3` over the 4-step enum.

**Interests N** = weighted mean of `I` over Hobbies (0.40), Tastes (0.35), Skills (0.25), skipping categories either side left empty.

**Life fit L** = `0.35 × stage + 0.35 × avail + 0.15 × place + 0.15 × age`
- stage: same = 1, adjacent in the enum = 0.6, else 0.3.
- avail: Jaccard of `availability` slots (if either empty ⇒ 0.5 neutral).
- place: in-person `1 − d / maxDistance`; online `1 − Δtz / 3h`.
- age: `1 − |Δyears| / 10`, floor 0.

**Total** = `wF × F + wN × N + wL × L`, starting weights **F 0.40, N 0.35, L 0.25** (my call). Weights live in a `match_weights` table (versioned row, one active) so they can be changed without a deploy.

**Pod score** for viewer V and pod P with members M:
`0.5 × min_m score(V,m) + 0.3 × mean_m score(V,m) + 0.2 × I(V.tags, P.anchor_tags)`.
An empty pod (creator only) uses the creator as the sole member.

### 6.3 Explanation returned with every match

- `score`, `breakdown: { faith, interests, lifeFit }` (each 0–100), `weightsVersion`.
- `reasons`: up to 4, ranked by contribution, each one of
  - `shared_tag` ("You both love Hiking"),
  - `related_tag` ("Your Hiking, their Trail running"),
  - `tradition` ("Both Baptist" / "Both evangelical traditions"),
  - `life` ("Both free weekday evenings", "Both early career", "8 km apart").
- The icebreaker uses the top reason.

## 7. Outcome logging

Table `match_events(id, viewer_id, kind 'duo'|'pod', target_id, event, score, breakdown jsonb, weights_version, created_at)` with `event` in:
`shown` (logged once per search result set, batched), `connected` / `joined`, `replied` (first message from the target in a duo, or the viewer's first message in a pod), `active_7d` (≥3 messages from each side within 7 days), `left_pod`.
Written server-side only. Not read by scoring in this project. Retain indefinitely for now (owner can set a retention rule later).

## 8. API and data flow

- `/api/state` stops loading every profile. It returns the viewer, the catalogue (or a category's top 12 + subgroups), the viewer's chats/pods, but **not** matches.
- New `GET /api/match?kind=duo|pods`: runs stage 1 (RPC) + stage 2, returns the top 20 with explanations, logs `shown`.
- New `GET /api/tags/search?q=`: trigram, then embedding fallback, then `tag_requests` log.
- `POST /api/onboarding` keeps its contract for existing callers but accepts the new fields and `level` per tag. Its current behaviour of wiping fields not sent must not wipe the new Life-fit fields (send-what-you-change, or keep the full-profile contract and update callers; builder's call, but no silent data loss).
- Home's Search 1v1 / Search Groups buttons call `/api/match` instead of re-fetching state.

## 9. Privacy and security

- New sensitive columns (`birth_date`, `gender`, `age_min/max`, `max_distance_km`, `only_my_tradition`, exact city coordinates) are readable only by the owner of the row and the service role (RLS + column grants or a separate `profile_private` table; builder's call).
- API responses for other users include only: name, avatar, headline, city name, tradition, faith stage label, life stage label, availability label, languages, public tags with levels, and the explanation. Never age, gender, birth date or distance rules.
- `match_candidates` and scoring run only server-side with the service role.

## 10. Migration, seed and testing

- **Migrations** (files under `supabase/migrations/`, applied **only after owner approval**): new columns/tables (`cities`, `traditions`, `tag_neighbors`, `tag_requests`, `match_weights`, `match_events`), `pgvector` and `pg_trgm` extensions, the `match_candidates` function, RLS.
- **No real users exist**, so no conversion of old free-text fields; old columns can be dropped once nothing reads them.
- **Tag migration**: every one of today's 39 tag slugs maps to a tag in the new catalogue (kept as-is or merged into a successor slug, with `user_tags` rewritten). No user loses a pick. Existing `user_tags` get `level = 2`.
- **Demo data**: demo profiles get believable Life-fit fields (mostly in one or two cities, or `meet_mode` online/both, same gender split so 1v1 demos return results) and a faith-first spread of tags, so search results demonstrate filtering and related-tag matching. Add a few more demo profiles if needed for non-empty results (builder's call). Needs owner approval like any seed change.
- **Testing**: add Vitest. Unit tests for `score.ts` (identical people ≈ 100, disjoint ≈ low with no floor, related-tag partial credit, IDF effect, empty category handling, pod weakest-link effect) and for the tag-search fallback order. SQL filter rules verified with a seed fixture and a script that asserts which pairs pass.

## 11. UI scope (within the existing design system)

- **Habits panel**: category cards with top-12 chips, "Show all" by subgroup, a search box with "Did you mean…" suggestions, level control and star on picked chips, counter "n picked, s of 3 starred".
- **Life fit**: a new onboarding step and an editable section in Profile Details; compact chip/segment controls (availability as a 2×3 grid of toggles).
- **Match cards**: real % plus a three-bar breakdown (Faith / Interests / Life fit) and up to 4 reasons; related-tag reasons visibly distinguished from exact shares.
- **Empty results**: when hard filters leave nobody, say which rule is narrowest and offer to widen it (e.g. "Nobody within 25 km yet. Try 50 km or online"). Never relax rules silently.

## 12. Decided by the owner

- Match goal: similar **and** compatible.
- Input: layered (fixed profile + category tags with top values + search mapping to curated tags), with per-tag intensity.
- Hard filters: distance/timezone, age range, same gender for 1v1, language.
- Tech: Supabase + pgvector, free open-source embedding model, no migration away.
- Learning: record outcomes now, tune later.
- Tradition: soft score with an opt-in hard rule.
- Score display: honest % with a breakdown.
- Pods: fit against every member, weakest link matters.
- Fix identity first (Phase 0, §3a).
- Scoring: filter/trim in the database, final score in server code.
- Demo accounts only ever match demo accounts.
- Age gate: block under 18, allow over 40.

## 13. Left to the builder (marked as my calls where they set numbers)

- Starting weights and sub-weights in §6.2, thresholds (0.60 neighbour cutoff, 0.7 related cap, 3 h timezone, ±6 years default age range, 25 km default distance): all my calls, all stored in config so they can change.
- Catalogue drafting (~300–400 tags, subgroups, synonyms) and tradition families, for owner review before seeding.
- Where embeddings are computed at runtime (Supabase Edge Function vs Next route with transformers.js), as long as the model matches the catalogue's.
- Private-column mechanism (column grants vs separate table).
- Exact level control and layout details inside the design system.
- City dataset choice and city-level distance handling (§4.1), my call.
- Demo-session mechanism in Phase 0.
- Order of delivery after Phase 0; a sensible order is schema → catalogue + embeddings → scoring module + tests → match API → UI.

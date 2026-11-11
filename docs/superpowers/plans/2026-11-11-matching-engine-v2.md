# Matching Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace exact-tag, padded-score matching with a filtered, explainable, faith-first engine on top of real Supabase sign-in.

**Architecture:** Phase 0 makes the Supabase Auth session the only source of identity. Phase 1 adds the schema, a curated ~300–400-tag catalogue and precomputed `gte-small` tag neighbours. Phase 2 adds a SQL hard-filter function (`match_candidates`), a pure TypeScript scoring module, and `/api/match` + `/api/tags/search`. Phase 3 rebuilds the habits panel, adds Life fit, and shows score breakdowns.

**Tech Stack:** Next.js 16.4.5 App Router (`src/proxy.ts`, not middleware), React 19, `@supabase/ssr` + `@supabase/supabase-js`, Postgres with `vector` + `pg_trgm`, `@huggingface/transformers` (`Xenova/gte-small`, 384-d), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-matching-engine-design.md` (read it alongside this plan; § references below point there).

## Global Constraints

- **Owner gate:** no migration, seed or production setting is applied to the hosted Supabase project until the owner says yes for that file. Steps marked **⛔ OWNER GATE** stop and ask. Writing the SQL file is fine.
- **Commits:** the owner commits only on request. Every "Commit" step reads: *commit only if the owner has authorised commits for this work; otherwise leave the changes staged and continue.*
- Before writing route or proxy code, read the matching guide in `node_modules/next/dist/docs/01-app/` (AGENTS.md). Proxy: `01-getting-started/16-proxy.md`; auth: `02-guides/authentication.md`.
- UI follows the existing soft-bento system (`src/app/globals.css`, `src/components/ubf`): light + dark, faith first, no emoji, existing radii (18 / 12 / 50%), copy in sentence case with British spelling as already used.
- Final scores are `round(100 × total)` with **no floors or ceilings**.
- Starting weights: Faith 0.40, Interests 0.35, Life fit 0.25. Faith = 0.60 tags + 0.25 tradition + 0.15 stage. Interests = Hobbies 0.40, Tastes 0.35, Skills 0.25. Life = 0.35 stage + 0.35 availability + 0.15 place + 0.15 age. Pod = 0.5 min + 0.3 mean + 0.2 anchor.
- Tag weight `w = level × (starred ? 1.5 : 1) × ln(1 + N / (1 + popularity))`. Related tag `s = (cos − 0.60) / 0.40 × 0.7` for cos ≥ 0.60 (same category only), exact = 1.
- Defaults: `age_min/age_max` = own age ± 6 with `age_min ≥ 18`; `max_distance_km` 25; online timezone gap ≤ 180 minutes. Under-18 sign-up is refused; over 40 is allowed.
- Never send another user's birth date, gender, age range, distance limit or `only_my_tradition` to the browser.
- Demo accounts only ever match demo accounts (both sides `is_demo_account` equal).

## Review Focus

1. **A user with an incomplete Life fit taps Search.** Expected: a 409 with `{ code: 'life_fit_incomplete' }` and the UI prompt, not a 500 or an empty list. Test in Task 10.
2. **Saving habits or Profile Details must not wipe other fields** (avatar, Life fit). Today's `/api/onboarding` replaces every field. Test in Task 13.
3. **A tag no one holds yet (popularity 0), a category one side left empty, or a person with no tags at all.** Expected: finite scores, no `NaN`, no division by zero. Tests in Task 8.
4. **Tag search with an empty, 1-character, 200-character, or `%_'` query.** Expected: `[]` or valid suggestions, never a SQL error. Test in Task 11.
5. **The session expires mid-use.** Expected: any API returns 401, and the client lands on `/auth` instead of a blank error. Test in Task 3.

---

## Phase 0: Identity

### Task 1: Vitest and the age gate

**Files:**
- Modify: `package.json` (add `vitest` dev dependency and `"test": "vitest run"`)
- Create: `vitest.config.ts` (resolve `@/` → `src/`)
- Create: `src/lib/age.ts`
- Test: `src/lib/age.test.ts`

**Interfaces:**
- Produces: `ageOn(birthDate: string, today: Date): number`, `isAdult(birthDate: string, today: Date): boolean` (`birthDate` is ISO `YYYY-MM-DD`), `defaultAgeRange(age: number): { min: number; max: number }`

- [ ] **Step 1: Write the failing tests**

```ts
expect(ageOn('2008-11-11', new Date('2026-11-11'))).toBe(18);
expect(ageOn('2008-11-12', new Date('2026-11-11'))).toBe(17);
expect(isAdult('2008-11-12', new Date('2026-11-11'))).toBe(false);
expect(ageOn('2004-02-29', new Date('2026-02-28'))).toBe(21);
expect(ageOn('2004-02-29', new Date('2026-03-01'))).toBe(22);
expect(defaultAgeRange(20)).toEqual({ min: 18, max: 26 });
expect(defaultAgeRange(45)).toEqual({ min: 39, max: 51 });
expect(() => ageOn('not-a-date', new Date())).toThrow();
```

- [ ] **Step 2: Run `npm test -- age` and confirm it fails**, because the module doesn't exist yet.
- [ ] **Step 3: Implement `src/lib/age.ts`** using calendar arithmetic, not milliseconds divided by 365.25.
- [ ] **Step 4: Run `npm test -- age` and confirm it passes.**
- [ ] **Step 5: Commit** (see Global Constraints).

### Task 2: Identity schema (`profile_private`) and RLS

**Files:**
- Create: `supabase/migrations/0005_identity_private_profile.sql`

**Interfaces:**
- Produces: the table `public.profile_private(user_id uuid pk → profiles.id on delete cascade, birth_date date, gender text check in ('man','woman'), age_min smallint, age_max smallint, max_distance_km smallint default 25, only_my_tradition boolean default false, updated_at timestamptz)`. RLS allows select/insert/update only where `user_id = auth.uid()`; the service role bypasses it. There is no anon access.

- [ ] **Step 1: Write the migration.**
  - Add checks `age_min >= 18` and `age_max >= age_min`.
  - Also tighten the existing `*_insert_own` / `*_update_own` policies on `profiles`, `user_tags` and `pod_members` so they use `auth.uid()`. Read them in `0001_production_schema.sql:168-310` first, and leave any policy that is already correct untouched.
- [ ] **Step 2: Verify locally** if Docker is available: run `npx supabase start && npx supabase db reset`. Expected: every migration applies with no error. If Docker isn't available, say so in the hand-off and rely on the owner gate.
- [ ] **Step 3: ⛔ OWNER GATE.** Ask the owner to approve applying `0005` to the hosted project. Apply it the way earlier migrations were applied (the SQL editor, or `supabase db push` if the project is linked).
- [ ] **Step 4: Commit.**

### Task 3: Session-only identity on the server

**Files:**
- Modify: `src/lib/session.ts` (delete `ACTIVE_USER_COOKIE`, the cookie override and the `DEFAULT_SEED_USER_ID` fallback)
- Create: `src/proxy.ts` (refresh the Supabase session cookies on every request; redirect page requests without a user to `/auth`; pass through `/auth`, `/api/auth/*`, static assets and `_next`)
- Modify: `src/app/api/{state,duos,pods,onboarding}/route.ts`, `src/app/api/rooms/[roomId]/route.ts`
- Modify: `src/lib/useAppState.ts`, `src/app/rooms/[roomId]/page.tsx` (on a 401 → `router.replace('/auth')`)
- Test: `scripts/check-identity.sh`

**Interfaces:**
- Produces:
  - `getSessionUserId(): Promise<string | null>`, which reads `supabase.auth.getUser()` from `createSupabaseServerClient()` only.
  - `requireUserId(): Promise<{ userId: string } | { response: NextResponse }>`; the response branch is a 401 `{ error: 'signed_out' }`.

- [ ] **Step 1: Write `scripts/check-identity.sh`.** It assumes the dev server is on :3000 and asserts:
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/state` → `401`
  - the same call with `-H 'Cookie: ubf_active_user_id=11111111-1111-4111-8111-111111111102'` → `401` (a forged cookie is ignored)
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/` → `307`, with `Location` ending in `/auth`
- [ ] **Step 2: Run it.** Expected: it FAILS today (200 responses).
- [ ] **Step 3: Implement.** Swap every `getActiveUserId()` call for `requireUserId()`. Keep the service-role admin client only where the route needs cross-user reads (state, rooms and the RPC calls), and always scope writes to `userId`.
- [ ] **Step 4: Run the script.** Expected: PASS. Also run `npx tsc --noEmit && npx eslint src`. Expected: 0 errors. Then in the browser: sign in as a demo user, delete the `sb-*` auth cookies in DevTools, and tap Search 1v1. Expected: you land on `/auth`, with no blank error screen.
- [ ] **Step 5: Commit.**

### Task 4: Sign-in, sign-up with age gate, demo-only switcher

**Files:**
- Modify: `src/app/api/auth/switch/route.ts` (split it into the modes below)
- Create: `src/app/api/auth/demo-profiles/route.ts`
- Modify: `src/app/auth/page.tsx` (birth date field on sign-up; the demo list comes from the new route instead of `/api/state`)
- Modify: `src/components/AppShell.tsx` (the switch list shows only for demo viewers; add Sign Out)
- Modify: `.env.local` (add `DEMO_ACCOUNT_PASSWORD`; the value is the seed password already in `0002`) and `.env.example` if one exists
- Test: `src/app/api/auth/switch/modes.test.ts` (pure helpers), `scripts/check-identity.sh` (extended)

**Interfaces:**
- Consumes: `isAdult`, `defaultAgeRange` (Task 1); `profile_private` (Task 2); `getSessionUserId` (Task 3).
- Produces:
  - `POST /api/auth/switch` with one of:
    - `{ mode: 'signin', email, password }`
    - `{ mode: 'signup', fullName, email, password, birthDate }`
    - `{ mode: 'demo', userId }`
    - `{ mode: 'signout' }`
  - Each mode sets or clears Supabase session cookies through `createSupabaseServerClient()`, never through a custom cookie.
  - `GET /api/auth/demo-profiles` → `{ id, full_name, avatar_url, headline }[]` where `is_demo_account = true`. It is public.
  - `validateSignup(body, today: Date): { ok: true, value } | { ok: false, field: 'birthDate' | 'email' | 'fullName' | 'password', message: string }`

- [ ] **Step 1: Write the failing tests for `validateSignup`.**
  - Under 18 → `{ ok:false, field:'birthDate', message:'You need to be 18 or older to join Unite by Faith.' }`.
  - A 45-year-old → ok.
  - A missing password → `field:'password'` (remove today's default-password fallback).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - **Demo mode:** load the profile and reject with 403 unless `is_demo_account`. Then `signInWithPassword` with the demo email and `process.env.DEMO_ACCOUNT_PASSWORD`.
  - **Signup:** create the auth user, the `profiles` row (`is_demo_account:false`) and the `profile_private` row with `birth_date` and the default age range, then sign in.
  - **Errors:** for the 400 / 401 / 403 / 409 (email taken) responses, reuse the auth page's existing field error UI.
- [ ] **Step 4: Run the tests and the extended identity check.** The check asserts:
  - `{mode:'demo', userId:<a non-demo id>}` → 403
  - demo sign-in then `/api/state` → 200 with the viewer's id equal to the demo id
  - sign out then `/api/state` → 401
- [ ] **Step 5: Browser check on :3000.**
  - Signing up at age 17 shows the error under the birth date field.
  - Switching between two demo profiles works.
  - A real user's menu has no switch list.
- [ ] **Step 6: Commit.**

---

## Phase 1: Schema and catalogue

### Task 5: Matching schema migration

**Files:**
- Create: `supabase/migrations/0006_matching_schema.sql`
- Modify: `src/types/database.ts` (add the types below)

**Interfaces:**
- Produces (SQL):
  - `create extension vector; create extension pg_trgm;`
  - `cities(id int pk, name, country_code char(2), lat double, lng double, timezone text, population int)` with a trigram index on `name`
  - `traditions(id text pk, name, family text, sort_order)`
  - On `profiles`, add:
    - `languages text[] not null default '{}'`
    - `location_city_id int → cities`
    - `meet_mode text check in ('in_person','online','both') default 'both'`
    - `life_stage text check in ('student','early_career','established_career','married_no_kids','parent_young_kids','parent_older_kids')`
    - `availability text[] not null default '{}'` (values `weekday_morning`, `weekday_afternoon`, `weekday_evening`, `weekend_morning`, `weekend_afternoon`, `weekend_evening`)
    - `tradition_id text → traditions`
    - `faith_stage text check in ('exploring','new_believer','growing','mature')`
  - On `taxonomy_tags`, add:
    - `subgroup text not null default ''`
    - `synonyms text[] not null default '{}'`
    - `embedding vector(384)`
    - `popularity int not null default 0`
    - `is_active bool not null default true`
    - a trigram index on `label`
  - On `user_tags`, add `level smallint not null default 2 check (level between 1 and 3)`.
  - New tables:
    - `tag_neighbors(tag_a text, tag_b text, sim real, source text check in ('model','curated'), pk(tag_a,tag_b))`
    - `tag_requests(id, user_id, query text, created_at)`
    - `match_weights(version int pk, is_active bool, config jsonb, created_at)`, seeded with version 1, active, holding the Global Constraints weights and thresholds as JSON
    - `match_events(id, viewer_id, kind text check in ('duo','pod'), target_id uuid, event text check in ('shown','connected','joined','replied','active_7d','left_pod'), score smallint, breakdown jsonb, weights_version int, created_at)` with an index on `(viewer_id, created_at)`
  - A trigger on `user_tags` insert/delete that maintains `taxonomy_tags.popularity`.
  - RLS: `cities`, `traditions`, `taxonomy_tags` and `tag_neighbors` are readable by everyone. `tag_requests`, `match_events` and `match_weights` are service-role only.
- Produces (TS): `Level`, `MeetMode`, `LifeStage`, `FaithStage`, `Slot` union types, plus the new optional fields on `UserProfile`, `UserTag` and `TaxonomyTag`.

- [ ] **Step 1: Write the migration.**
- [ ] **Step 2: Verify locally** with `npx supabase db reset` (if Docker is available). Then run `select config from match_weights where is_active` and confirm it returns the v1 JSON.
- [ ] **Step 3: ⛔ OWNER GATE** for `0006`.
- [ ] **Step 4: Run `npx tsc --noEmit`.** Expected: 0 errors in `src`.
- [ ] **Step 5: Commit.**

### Task 6: Curated catalogue, traditions and cities, as reviewable data

**Files:**
- Create: `supabase/seed-data/catalogue.json` (`{ slug, label, category, subgroup, description, synonyms[], legacySlugs[] }[]`, 300–400 entries)
- Create: `supabase/seed-data/traditions.json` (`{ id, name, family }[]`)
- Create: `scripts/import-cities.ts` (downloads GeoNames `cities15000.zip` into the scratchpad and writes the `cities` insert SQL; attribution string `"City data © GeoNames, CC BY 4.0"`)
- Create: `scripts/build-catalogue-sql.ts` → writes `supabase/migrations/0007_catalogue_seed.sql`
- Test: `scripts/catalogue.test.ts`

**Interfaces:**
- Produces: `0007_catalogue_seed.sql`, which upserts tags, traditions and cities. It rewrites legacy slugs in `user_tags.tag_slug`, `pods.anchor_tags` and `chat_rooms.shared_tags` to their successors (a merged duplicate keeps one row, with the higher `is_priority`). Then it sets `is_active = false` on any old slug that has no successor (expected: none).

- [ ] **Step 1: Write the failing tests over the JSON.**
  - Slugs are unique kebab-case.
  - All 39 slugs from `0002_seed_taxonomy_and_community.sql` appear exactly once across `legacySlugs` or as an unchanged slug.
  - Each of the 4 categories has ≥ 12 tags.
  - Synonyms are lowercase with no duplicates within a tag.
  - Every `subgroup` belongs to its category's allowed list from spec §4.2.
  - Traditions `family` is one of a closed list defined at the top of the test.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Draft the JSON.** Faith subgroups are Prayer, Scripture, Worship, Serving, Community and Learning. Keep tech/skills tags ≤ 20% of the catalogue so faith stays first. Write the build script.
- [ ] **Step 4: Run the tests and confirm they pass.** Run the build script and check that the SQL file exists.
- [ ] **Step 5: ⛔ OWNER GATE: catalogue review.** Send the owner the list of tags by category and subgroup, plus the traditions and families, and wait for edits. Then **⛔ OWNER GATE** to apply `0007`.
- [ ] **Step 6: Commit.**

### Task 7: Tag embeddings and neighbours

**Files:**
- Modify: `package.json` (add `@huggingface/transformers`, plus `tsx` as a dev dependency if not present)
- Create: `src/lib/matching/neighbors.ts`
- Create: `scripts/embed-catalogue.ts` → writes `supabase/migrations/0008_tag_embeddings.sql` (embedding updates, plus `tag_neighbors` rows with `source='model'`)
- Create: `src/lib/matching/embed.ts` (shared loader so runtime queries use the exact same model and text format)
- Test: `src/lib/matching/neighbors.test.ts`

**Interfaces:**
- Produces:
  - `tagEmbeddingText(t: { label: string; description: string; synonyms: string[] }): string` → `"{label}. {description}. Also: {synonyms joined ', '}"`. When there are no synonyms, omit the `" Also: …"` part.
  - `embed(texts: string[]): Promise<Float32Array[]>`, using `Xenova/gte-small` with mean pooling and normalised output.
  - `computeNeighbors(items: { slug: string; category: PillarCategory; vec: Float32Array }[], opts = { k: 10, min: 0.60 }): { a: string; b: string; sim: number }[]`. It works within the same category only, is symmetric (if a→b is kept, b→a is present), and never emits self-pairs.

- [ ] **Step 1: Write the failing tests for `computeNeighbors`** using hand-made unit vectors.
  - A cross-category pair with cos 0.99 is excluded.
  - A pair with cos 0.59 is excluded.
  - k = 2 caps the neighbours per tag.
  - The output is symmetric.
  - `tagEmbeddingText` has the format above.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `neighbors.ts`, `embed.ts` and the script.
- [ ] **Step 4: Run the tests and confirm they pass.** Run the script, then spot-check that `hiking` lists something like `trail-running` and that no faith tag lists a hobby.
- [ ] **Step 5: ⛔ OWNER GATE** to apply `0008`.
- [ ] **Step 6: Commit.**

---

## Phase 2: Engine

### Task 8: Pure scoring module

**Files:**
- Create: `src/lib/matching/score.ts`
- Test: `src/lib/matching/score.test.ts`

**Interfaces:**
- Consumes: the types from Task 5.
- Produces:

```ts
export interface TagPick { slug: string; category: PillarCategory; level: Level; starred: boolean }
export interface MatchPerson {
  id: string; isDemo: boolean; tags: TagPick[];
  traditionId: string | null; traditionFamily: string | null; faithStage: FaithStage | null;
  lifeStage: LifeStage | null; availability: Slot[]; age: number;
  cityId: number; cityName: string; lat: number; lng: number; tzOffsetMin: number;
  meetMode: MeetMode; maxDistanceKm: number;
}
export interface MatchWeights { version: number; total: { faith: number; interests: number; life: number };
  faith: { tags: number; tradition: number; stage: number };
  interests: { hobbies: number; tastes: number; skills: number };
  life: { stage: number; availability: number; place: number; age: number };
  pod: { min: number; mean: number; anchor: number };
  neighborMin: number; relatedCap: number; onlineTzMaxMin: number }
export interface ScoreContext { neighbors: Map<string, Map<string, number>>; popularity: Map<string, number>; activeUsers: number; weights: MatchWeights }
export type Reason =
  | { kind: 'shared_tag'; slug: string }
  | { kind: 'related_tag'; mine: string; theirs: string }
  | { kind: 'tradition'; same: boolean; family: string }
  | { kind: 'life'; detail: 'same_stage' | 'availability' | 'same_city' | 'distance'; value?: string };
export interface PairScore { score: number; breakdown: { faith: number; interests: number; lifeFit: number }; reasons: Reason[]; weightsVersion: number }
export function tagSimilarity(a: string, b: string, ctx: ScoreContext): number;
export function interestSimilarity(A: TagPick[], B: TagPick[], ctx: ScoreContext): number | null;
export function scorePair(a: MatchPerson, b: MatchPerson, ctx: ScoreContext): PairScore;
export function scorePod(viewer: MatchPerson, members: MatchPerson[], anchorTags: string[], ctx: ScoreContext): PairScore;
```

Rules the signatures don't fix:
- A `null` component (an empty side) is dropped, and the remaining weights at that level are renormalised. If everything is null, the component is 0.
- Breakdown values are `round(100 × component)`.
- Place:
  - same `cityId` → 1;
  - in-person → `1 − d / min(maxDistanceKm)` (haversine km, floored at 0);
  - online → `1 − Δtz / onlineTzMaxMin`.
  - Use in-person if both people allow it and they are within distance; otherwise use online.
- Reasons: up to 4.
  - Order: exact shared tags by combined weight, then related pairs, then tradition (when T ≥ 0.6), then life details.
  - Faith tags come first among equals.
  - `distance` appears only for different cities.
- `scorePod`:
  - `anchor` = `interestSimilarity(viewer.tags, anchorTags as level-2 unstarred picks)`, where null → 0.
  - An empty `members` list throws, because the caller passes the creator.
  - Reasons are merged from the best-scoring member.

- [ ] **Step 1: Write the failing tests** (use a fixture factory `person(overrides)`; `N = 100`):
  - `tagSimilarity`: same slug → 1; neighbour cos 1.0 → 0.7; cos 0.80 → 0.35 (±1e-9); cos 0.60 → 0; absent → 0.
  - `interestSimilarity`: identical → 1; disjoint → 0; either side empty → `null`.
  - **Rarity (IDF):** with A = {coffee (pop 90), hiking (pop 1)}, the similarity to {hiking} is greater than the similarity to {coffee}.
  - **Level:** a passionate shared tag outweighs a casual one, measured against the same partner.
  - **Popularity 0** and **tags absent from the `popularity` map** → finite result.
  - **Identical people** (same city, tradition, stage, availability, age, tags) → `score === 100`.
  - **Fully different people** → `score === 5`. The fixture:
    - disjoint tags in every category;
    - different tradition families;
    - `exploring` vs `mature`;
    - `student` vs `parent_older_kids`;
    - disjoint non-empty availability;
    - ages 10 years apart;
    - in-person, different cities exactly `maxDistanceKm` apart.
    - The arithmetic: F = 0.05, N = 0, L = 0.105, so 0.4·0.05 + 0.25·0.105 = 0.046 → 5.
  - **Empty availability** on one side → availability term 0.5.
  - **A person with zero tags** → finite score, `breakdown.interests === 0`.
  - **Tradition:** same → T 1; same family → 0.6; else 0.2.
  - **Pod weakest link:** viewer vs members with pair scores {90, 90, 30} and anchor 0.5 → `round(100·(0.5·0.30 + 0.3·0.70 + 0.2·0.5)) = 46`. Stub `scorePair` through a fixture built to produce those values, or test the combiner `combinePod(scores: number[], anchor: number, w)` exported for the test.
  - **Reasons:** a related pair yields `{ kind:'related_tag', mine:'hiking', theirs:'trail-running' }`, and there are never more than 4 reasons.
- [ ] **Step 2: Run `npm test -- score` and confirm it fails.**
- [ ] **Step 3: Implement `score.ts`.** No I/O and no imports from `next` or `supabase`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.**

### Task 9: Hard-filter SQL (`match_candidates`, `match_filter_counts`)

**Files:**
- Create: `supabase/migrations/0009_match_candidates.sql`
- Create: `scripts/check-filters.ts` (seeds a throwaway fixture inside a transaction it rolls back, then asserts which pairs pass)

**Interfaces:**
- Produces:
  - `haversine_km(lat1, lng1, lat2, lng2) returns double`, immutable.
  - `match_candidates(viewer uuid, kind text, lim int default 300) returns table(user_id uuid, pre_rank int)` for `kind = 'duo'`, and `match_pod_candidates(viewer uuid, lim int default 100) returns table(pod_id uuid, pre_rank int)`. Both are `security definer`, with execute granted to `service_role` only.
  - `search_tags_text(q text) returns table(slug text, score real)`: `greatest(similarity(label, q), max similarity over synonyms)` for active tags, top 8, `q` is a bound parameter. Security invoker, so anyone can execute it.
  - `match_filter_counts(viewer uuid, kind text) returns table(rule text, passing int)`, where `rule` is one of `age`, `language`, `place`, `gender`, `tradition`. It counts each rule on its own, which supports the "narrowest rule" empty state.
- Rules (spec §6.1), all mutual:
  - onboarding completed;
  - `is_demo_account` equal on both sides;
  - age inside each other's range (age from `profile_private.birth_date`);
  - `languages && languages`;
  - place passes when (both allow in-person [`in_person`/`both`] and distance ≤ both `max_distance_km`) OR (both allow online [`online`/`both`] and |tz offset now| ≤ 180 min);
  - duo: same `gender` and both `fellowship_mode in ('both','duo_only')`;
  - either side `only_my_tradition` → same `tradition_id`.
  - Pods: the viewer passes age/language/place/tradition against every member (gender is not applied), status not in (`full`,`archived`), `member_count < max_members`, the viewer is not already a member, and the viewer's mode is in (`both`,`group_only`).
  - `pre_rank` = count of the viewer's tags that equal or neighbour the candidate's tags.

- [ ] **Step 1: Write `check-filters.ts`.** It asserts each of these, one per assertion:
  - an age range excludes;
  - no shared language excludes;
  - 30 km in-person with a 25 km limit excludes;
  - both online with 5 h tz gap excludes, and with 2 h gap passes;
  - duo of different gender excludes, while the same pair is allowed into a mixed pod;
  - `only_my_tradition` excludes a different tradition;
  - demo vs real excludes;
  - a pod with one member failing the viewer's age range excludes;
  - a full pod excludes;
  - `match_filter_counts` returns 5 rows with the expected counts for the fixture.
- [ ] **Step 2: Run it against local Supabase and confirm it fails** (the functions don't exist yet).
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run `npx supabase db reset && npx tsx scripts/check-filters.ts` and confirm every assertion passes.**
- [ ] **Step 5: ⛔ OWNER GATE** for `0009`.
- [ ] **Step 6: Commit.**

### Task 10: `/api/match`

**Files:**
- Create: `src/lib/matching/load.ts` (fetches candidate rows, tags, neighbours, popularity, active weights and city data → `MatchPerson`s and `ScoreContext`)
- Create: `src/lib/matching/rank.ts`
- Create: `src/app/api/match/route.ts`
- Test: `src/lib/matching/rank.test.ts`

**Interfaces:**
- Consumes: `requireUserId` (Task 3); `scorePair`/`scorePod` (Task 8); the RPCs (Task 9).
- Produces:
  - `lifeFitMissing(p: { birthDate?: string|null; gender?: string|null; languages: string[]; cityId: number|null; lifeStage: string|null; faithStage: string|null; traditionId: string|null }): string[]`, which returns the names of missing required fields.
  - `rankDuos(viewer, candidates, ctx, limit = 20): Array<PairScore & { userId: string }>`, sorted by score descending with ties broken by `userId`.
  - `rankPods(viewer, pods: { podId; members: MatchPerson[]; anchorTags: string[] }[], ctx, limit = 20)`.
  - `GET /api/match?kind=duo|pods` returns one of:
    - 200 `{ kind, results: [...public card fields + PairScore], emptyReason?: { rule, passing } }`
    - 409 `{ code: 'life_fit_incomplete', missing: string[] }`
    - 401
    - 400 for a bad `kind`
  - Public card fields follow spec §9 only. A duo result carries `existing_chat_room_id`, as today. A pod result carries the existing `FellowshipPod` fields minus private member data.
  - On 200 it inserts one batched `match_events` row per result with `event='shown'` (fire-and-forget, after building the response). When `results` is empty, it calls `match_filter_counts` and sets `emptyReason` to the rule with the smallest `passing`.

- [ ] **Step 1: Write the failing tests.**
  - `lifeFitMissing` on a complete person → `[]`, and with no city → `['city']`.
  - `rankDuos` orders by score, caps at `limit`, and gives stable order on ties.
  - `rankPods` passes the creator as the sole member for a 1-member pod.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** `load.ts`, `rank.ts` and the route. The route uses the admin client only after `requireUserId`.
- [ ] **Step 4: Run the tests, then curl as a demo session.**
  - `kind=duo` → 200 with `results[0].breakdown`.
  - `kind=bad` → 400.
  - A profile missing a city → 409 with `missing` including `city`.
  - Grep the JSON for `birth`, `gender` and `age_min`. Expected: no matches.
- [ ] **Step 5: Commit.**

### Task 11: `/api/tags/search`

**Files:**
- Create: `src/lib/matching/suggest.ts`
- Create: `src/app/api/tags/search/route.ts`
- Test: `src/lib/matching/suggest.test.ts`

**Interfaces:**
- Consumes: `embed`, `tagEmbeddingText` format (Task 7).
- Produces:
  - `normaliseQuery(q: string): string | null`: trim, collapse whitespace, lowercase, slice to 60 chars; `null` if fewer than 2 chars.
  - `pickSuggestions(trgm: {slug; score}[], vec: {slug; cos}[]): { source: 'text' | 'meaning' | 'none'; slugs: string[] }`. Text hits with score ≥ 0.35 win (top 8). Otherwise meaning hits with cos ≥ 0.70 (top 3). Otherwise `none`.
  - `GET /api/tags/search?q=` → `{ source, tags: TaxonomyTag[] }`.
    - The text search uses a parameterised `similarity()` over label and synonyms through the RPC `search_tags_text` (Task 9).
    - The meaning search embeds `q` with the same model in this Node route and orders by `embedding <=> $1`.
    - `none` → insert `tag_requests` (user id plus the normalised query).

- [ ] **Step 1: Write the failing tests.**
  - `normaliseQuery('')`, `('a')` → `null`.
  - A 200-char input → length 60.
  - `"%_'"` → `"%_'"` (passed as a bound parameter, never interpolated).
  - Threshold boundaries 0.35 / 0.70.
  - Text beats meaning when both are present.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** The first query loads the model, so cache the pipeline at module scope.
- [ ] **Step 4: Run the tests, then curl as a demo session.**
  - `q=bouldering` → `source:'text'` or `'meaning'`, including `climbing` if it's in the catalogue.
  - `q=%25_%27` → 200.
  - `q=zzzzqqq` → `source:'none'` and a row in `tag_requests`.
- [ ] **Step 5: Commit.**

### Task 12: Outcome events

**Files:**
- Create: `src/lib/matching/outcomes.ts`
- Modify: `src/app/api/duos/route.ts` (`connected`), `src/app/api/pods/route.ts` (`joined`, `left_pod` if leave exists), `src/app/api/rooms/[roomId]/route.ts` (message POST → `replied`, `active_7d`)
- Test: `src/lib/matching/outcomes.test.ts`

**Interfaces:**
- Produces: `outcomeEventsForMessage(input: { roomType: 'duo_1v1' | 'pod_group'; senderId: string; roomCreatedAt: Date; now: Date; history: { senderId: string; createdAt: Date }[]; alreadyLogged: Set<'replied' | 'active_7d'> }): ('replied' | 'active_7d')[]`.
  - `replied` = the first message from a participant other than the one who connected (duo), or the sender's first message (pod).
  - `active_7d` = within 7 days of `roomCreatedAt`, each side has ≥ 3 messages (in a pod, ≥ 3 messages from ≥ 2 members).
  - It is never emitted twice.
- Events are written with the admin client, carrying the `score`/`breakdown` from the latest `shown` row for that viewer/target if one exists. A write failure never fails the user's action.

- [ ] **Step 1: Write the failing tests.**
  - The first reply → `['replied']`.
  - The 3rd message from each side on day 6 → `['active_7d']`.
  - The same on day 8 → `[]`.
  - Already logged → `[]`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire it in.**
- [ ] **Step 4: Run the tests and confirm they pass.** Send two messages as two demo users, then check `match_events` has `connected` and `replied`.
- [ ] **Step 5: Commit.**

### Task 13: Profile write API without silent wipes

**Files:**
- Create: `src/lib/profile-update.ts`
- Modify: `src/app/api/onboarding/route.ts`
- Test: `src/lib/profile-update.test.ts`

**Interfaces:**
- Produces:
  - `buildProfileUpdate(body: unknown): { profile: Partial<ProfileColumns>; private: Partial<PrivateColumns>; tags?: { slug; category; level: Level; isPriority: boolean }[] } | { error: { field: string; message: string } }`.
  - It only includes keys present in `body` (send-what-you-change).
  - It validates the enums from Task 5, `age_min ≥ 18`, `age_max ≥ age_min`, `languages` non-empty when present, ≤ 3 starred, ≤ 30 tags, and `level ∈ {1,2,3}`.
  - `POST /api/onboarding` applies only those keys, and replaces `user_tags` only when `tags` is present.

- [ ] **Step 1: Write the failing tests.**
  - A body with only `tags` → `profile` is `{}` and `private` is `{}` (no avatar wipe).
  - A body with `lifeStage:'retired'` → error on `lifeStage`.
  - Four starred tags → error on `tags`.
  - `ageMin: 17` → error.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Update `HabitsPanel` to send only `{ tags }`, and remove its full-profile workaround.
- [ ] **Step 4: Run the tests.** Then save habits in the browser and confirm the avatar and headline are unchanged in the DB.
- [ ] **Step 5: Commit.**

---

## Phase 3: UI

### Task 14: Slim `/api/state` and the new habits panel

**Files:**
- Modify: `src/app/api/state/route.ts` (drop `allProfiles` and the matches; return the viewer with private fields for self only, the catalogue with `subgroup`/`synonyms`/`popularity`, the viewer's chats and pods, and `demoProfiles` only when the viewer is demo)
- Modify: `src/lib/useAppState.ts`, `src/components/HabitsPanel.tsx`
- Create: `src/components/TagSearch.tsx`

**Interfaces:**
- Consumes: `/api/tags/search` (Task 11); `POST /api/onboarding` `{ tags }` (Task 13).
- Produces: `TagSearch({ category?: PillarCategory, picked: string[], onPick: (slug: string) => void })`.
  - The input has the label "Search habits" and is debounced at 250 ms.
  - Results show as chips. Meaning-sourced results are headed "Did you mean…".
  - `none` shows "We don't have that yet. We've noted it."

- [ ] **Step 1: Make the edit-mode changes.**
  - Each category shows the 12 most popular active tags (`popularity` desc, then `sort_order`).
  - "Show all" expands grouped by subgroup.
  - `TagSearch` sits at the top.
  - A picked chip shows a level control: a 3-step `role="radiogroup"` labelled "How much: Casual / Regular / Passionate", default Regular. It sits alongside the existing star.
  - The counter reads "{n} picked, {s} of 3 starred".
  - In view mode, level shows as a subtle chip treatment (builder's call within the system), with the accessible text "(passionate)".
- [ ] **Step 2: Verify in the browser at 1280 and 320, light and dark.**
  - There's no horizontal overflow.
  - Keyboard-only: you can pick, set the level, star, search, pick a suggestion and save.
  - The console shows no errors.
  - `npx tsc --noEmit && npx eslint src` → 0 errors.
- [ ] **Step 3: Commit.**

### Task 15: Life fit in onboarding and Profile Details; search gate

**Files:**
- Modify: `src/app/onboarding/page.tsx` (new "Life fit" step and an editable section)
- Create: `src/components/LifeFitFields.tsx`
- Modify: `src/app/page.tsx` (the Search buttons call `/api/match`; on 409 → a Note "Add your Life fit details to search." with a button to `/onboarding#life-fit`)

**Interfaces:**
- Consumes: `buildProfileUpdate` keys (Task 13): `birthDate` (shown read-only after sign-up), `gender`, `ageMin`, `ageMax`, `languages`, `cityId`, `meetMode`, `maxDistanceKm`, `lifeStage`, `availability`, `traditionId`, `onlyMyTradition`, `faithStage`. City lookup uses a new `GET /api/cities?q=` (trigram, top 8) added in this task.
- Field labels are fixed, matching spec §4.1:
  - "Life stage"
  - "Your city" (with the hint "Pick from the list")
  - "How you'd like to meet" (In person / Online / Both)
  - "How far you'd travel" (10 / 25 / 50 / 100 km)
  - "When you're usually free" (a 2×3 toggle grid: Weekday / Weekend × Morning / Afternoon / Evening)
  - "Languages"
  - "Church tradition"
  - "Only match people from my tradition"
  - "Where you are in your faith" (Exploring / New believer / Growing / Mature)
  - "Gender" (with the hint "Used only so 1v1 matches are same-gender. Never shown.")
  - "Ages you'd like to meet"

- [ ] **Step 1: Implement.** Gender and age range carry the hint "Only you can see this."
- [ ] **Step 2: Verify in the browser.**
  - A new demo-less account → onboarding → Life fit → Search 1v1 returns results or the narrowest-rule empty state.
  - Clearing the city → Search shows the 409 prompt.
  - The 320px check and the keyboard check both pass.
- [ ] **Step 3: Commit.**

### Task 16: Match cards with breakdown, reasons and the narrowest-rule empty state

**Files:**
- Modify: `src/components/MatchCards.tsx`, `src/app/page.tsx`, `src/components/ubf/index.tsx` (replace `reasonLine` with `reasonText(r: Reason, tagMap): string`)
- Test: `src/components/ubf/reasons.test.ts`

**Interfaces:**
- Consumes: the `/api/match` response (Task 10).
- Produces: `reasonText`. Its copy is exact:
  - `shared_tag` → "You both love {label}"
  - `related_tag` → "Your {mine}, their {theirs}"
  - `tradition` → same: "Both {tradition name}", family: "Both {family} traditions"
  - `life` → "Both {stage label}" / "Both free {slot labels joined ' and '}" / "Both in {city}" / "{n} km apart"
- The empty-state copy by rule:
  - `place` → "Nobody near you yet. Try a wider distance or meeting online."
  - `age` → "Nobody in your age range yet. Try widening it."
  - `language` → "Nobody shares your languages yet."
  - `gender` → "No 1v1 matches yet. Try Search Groups."
  - `tradition` → "Nobody from your tradition yet. Try turning off Only my tradition."
  - Each has a button to the relevant Profile Details field.

- [ ] **Step 1: Write the failing tests** for `reasonText`: one case per reason kind, with the exact strings above.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The card keeps `ScorePill` with the real score and adds three labelled bars: Faith / Interests / Life fit, `role="meter"` with `aria-valuenow`.
  - It shows up to 4 reasons. Related-tag reasons use the dashed chip variant so they read differently from exact shares.
  - Remove the padding logic from the old `engine.ts` paths once nothing imports them, and delete `computeDuoMatches`/`scoreAndRankPods` if unused (keep `buildContextualIcebreakers`, but feed it the top reason).
- [ ] **Step 4: Run the tests.** Then check in the browser that bars and reasons render, that the empty state shows for a fixture viewer with a 10 km limit, and that the 320px light/dark checks pass.
- [ ] **Step 5: Commit.**

### Task 17: Demo seed rewrite and end-to-end check

**Files:**
- Create: `supabase/migrations/0010_demo_seed_v2.sql`

**Interfaces:**
- Consumes: everything above.
- It gives the 8 demo profiles, plus up to 6 new ones if needed for non-empty results:
  - Life fit fields, with most in Bengaluru or Pune (or `meet_mode` both/online);
  - a balanced gender split so every demo viewer has ≥ 2 duo results;
  - `profile_private` rows;
  - faith-first tags with levels drawn from the new catalogue;
  - at least 2 related-tag pairs (e.g. hiking ↔ trail-running).
- New demo auth users use the same `DEMO_ACCOUNT_PASSWORD`, and all of them have `is_demo_account = true`.

- [ ] **Step 1: Write the migration.** Locally, run `npx supabase db reset`, then for each demo id call `/api/match?kind=duo` and `kind=pods` through the demo session. Expected: ≥ 2 results each, with at least one `related_tag` reason across the set.
- [ ] **Step 2: ⛔ OWNER GATE** for `0010`.
- [ ] **Step 3: Run the full verification.**
  - `npm test` → all pass.
  - `npx tsc --noEmit && npx eslint src` → 0 errors.
  - `scripts/check-identity.sh` and `scripts/check-filters.ts` pass.
  - Browser walk-through:
    1. Sign up at 17 (refused).
    2. Sign up as an adult.
    3. Life fit, then habits with search and levels.
    4. Search 1v1 and Search Groups.
    5. Connect, then send a message.
    6. Confirm the events were logged.
    7. Switch demo profiles.
    8. Sign out.
  - Repeat at 320px in dark mode.
- [ ] **Step 4: Commit.**

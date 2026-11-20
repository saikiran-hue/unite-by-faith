# Match Tab Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening Match searches 1v1 straight away behind a verse-while-you-wait loading screen, shows every eligible person 20 at a time, hides people you already chat with, and turns age, place and language into score penalties instead of filters.

**Architecture:**
- **App side (Tasks 1–3, safe on today's strict SQL):** the match API drops chat partners before ranking and returns the full ranked list. The Match tab auto-searches and pages through the list. The scorer treats age range, place and language as Life Fit parts that drop to 0 on a mismatch.
- **Database side (Task 4, one transaction):** migration 0019 relaxes the four eligibility functions (search plus Connect/Join) down to gender, fellowship mode, tradition and the new safety rules (18+, complete profile). It also adds the version 2 weights.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, plain CSS under `.ubf` in `src/app/globals.css`, Vitest, Supabase Postgres (SQL functions, `security definer`).

**Spec:** `docs/superpowers/specs/2026-11-21-match-tab-part2-design.md`

## Global Constraints

**Process**
- Next.js 16 has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code.
- Tasks 1–3 on branch `feature/match-part2`. Task 4 on its own branch `feature/match-0019`, cut from the Task 3 head, so Tasks 1–3 can merge and ship first. Migration 0019 must not reach `main` until the owner approves applying it, because a later `supabase db push` (e.g. for 0018) would apply it too. Commits are fine. Pushing, deploying, and applying or test-running SQL against the hosted database (`jqfgqglxesixnczieges`) need explicit owner approval. Task 4 writes files only.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WQWPbZ6Titq3hsJLhkEjm1
  ```
- Verification per task: `npm test` (whole suite), `npx tsc --noEmit`, and `npx eslint <changed files>`, all clean. After the last task, `npm run cf-build` passes, then restart dev with `pkill -f "next dev"; rm -rf .next; npm run dev`, because the build overwrites `.next`.

**Matching rules**
- Strict rules: 1v1 same gender; fellowship mode (1v1 both on `both`/`duo_only`, groups viewer on `both`/`group_only`); "Only my tradition" when either person has it on; onboarded, same demo-ness, not yourself; both 18+ by birth date; both have a birth date, at least one language and a city.
- Soft rules lower only the Life Fit part: age range, place (distance, in-person vs online, time zone), language. There is no multiplier or cap on the total.
- Shown % is at least 1.
- Page size is 20 (`MATCH_PAGE = 20`). The SQL caps stay: `match_candidates` lim 300, `match_pod_candidates` lim 100.
- `match_events` keeps logging only the first 20 results as `shown`.

**Privacy and styling**
- Card data stays the explicit `pub` allow-list. `ageMin` and `ageMax` are scoring-only and never sent to the browser. `languages` is already public in `pub`; that is unchanged.
- No card or reason text may reveal another person's age range or travel distance.
- CSS: plain CSS under `.ubf`. Dark theme selectors use the pattern `[data-theme="dark"] .ubf .x, .ubf[data-theme="dark"] .x`. Use the existing tokens (`--u-ink`, `--u-accent`, `--r-tile`, `--font-verse`).
- The global `prefers-reduced-motion` rule in `globals.css` already stops all `.ubf` animation. New animation must stay inside `.ubf` so the rule covers it.

## Review Focus

1. **Exactly one search per opening.** This includes React StrictMode's double effect in dev and Back from a chat, which remounts Home. Pinned by `shouldAutoSearch` tests (Task 2) and the network check in Task 2 Step 6.
2. **A viewer with fewer than 3 habits opens Match.** No request is sent; the "Pick at least 3 habits" note shows. Pinned by the `shouldAutoSearch` tests (Task 2).
3. **Chat rows in either direction, or with no room yet.** A `duo_matches` row where the viewer is `user_b_id` must hide the other person. A row with a null `chat_room_id` must not. Pinned by the `splitChatPartners` tests (Task 1).
4. **Same city, one person in-person-only, the other online-only.** Place scores 0 and no same-city reason appears, where today it scores 1. Pinned by the place-table tests (Task 3).
5. **Exactly 20 or 21 results.** 20 shows no Show More; 21 shows one more after a tap. Pinned by the `pageOf` tests (Task 2).

---

### Task 1: Match API hides chat partners and returns everyone

**Files:**
- Create: `src/lib/matching/chat-partners.ts`, `src/lib/matching/chat-partners.test.ts`
- Modify:
  - `src/lib/matching/rank.ts:29-51` (default limit)
  - `src/lib/matching/rank.test.ts`
  - `src/app/api/match/route.ts`
  - `src/components/MatchCards.tsx:28,99-112`
  - `src/lib/useAppState.ts:111-120`
  - `src/app/page.tsx:572-577`

**Interfaces:**
- Produces:
  - `splitChatPartners(viewerId: string, candidateIds: string[], duoRows: { user_a_id: string; user_b_id: string; chat_room_id: string | null }[]): { keep: string[]; allChatted: boolean }`
  - `rankDuos(viewer, candidates, ctx, limit = Infinity)` and `rankPods(viewer, pods, ctx, limit = Infinity)`
  - API body `emptyReason: { rule: 'chatted', passing: 0 }` when every SQL candidate is a chat partner
  - `DuoResult` without `existing_chat_room_id`

- [ ] **Step 1: Write the failing tests**

```ts
// chat-partners.test.ts
const row = (a: string, b: string, room: string | null = 'r') => ({ user_a_id: a, user_b_id: b, chat_room_id: room });
it('drops partners in either direction', () => {
  expect(splitChatPartners('v', ['x', 'y', 'z'], [row('v', 'x'), row('y', 'v')]))
    .toEqual({ keep: ['z'], allChatted: false });
});
it('keeps someone whose duo row has no room yet', () => {
  expect(splitChatPartners('v', ['x'], [row('v', 'x', null)]).keep).toEqual(['x']);
});
it('reports allChatted only when there were candidates and all are partners', () => {
  expect(splitChatPartners('v', ['x'], [row('v', 'x')])).toEqual({ keep: [], allChatted: true });
  expect(splitChatPartners('v', [], [])).toEqual({ keep: [], allChatted: false });
});
it('keeps candidate order', () => {
  expect(splitChatPartners('v', ['c', 'a', 'b'], []).keep).toEqual(['c', 'a', 'b']);
});

// rank.test.ts: rewrite 'caps at the limit' (rank.test.ts:67-70), which expects a default of 20
it('returns everyone by default and caps only at an explicit limit', () => {
  expect(rankDuos(viewer, many, ctx)).toHaveLength(30);
  expect(rankDuos(viewer, many, ctx, 5)).toHaveLength(5);
});

```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/lib/matching`. Expected: FAIL (module `./chat-partners` not found).

- [ ] **Step 3: Implement**
  - Implement `splitChatPartners` in `chat-partners.ts`. Change the default `limit` to `Infinity` in both rank functions. Leave `RULE_ORDER` alone: the SQL is still strict until Task 4.
  - In `route.ts`, duo branch, before `loadPeople`:
    - Fetch the viewer's rows with `admin.from('duo_matches').select('user_a_id, user_b_id, chat_room_id').or(\`user_a_id.eq.${userId},user_b_id.eq.${userId}\`)`. Throw on error, like the other queries.
    - Run `splitChatPartners`, then load and rank only `keep`, calling `rankDuos(...)` without a limit.
    - Delete the post-rank `rooms` lookup and the `existing_chat_room_id` field.
    - `events` takes only `ranked.slice(0, 20)`.
    - When `allChatted` and there are no results, set `body.emptyReason = { rule: 'chatted', passing: 0 }` and skip `match_filter_counts`. Pass the flag into `respond`.
  - In the pods branch, call `rankPods(...)` without a limit, and `events` takes only `ranked.slice(0, 20)`.
  - Remove `existing_chat_room_id`:
    - from `DuoResult`;
    - the "Continue with {first}" branch in `DuoCard` (Connect 1v1 is the only button);
    - the `startDuoChat` parameter and its early `router.push` in `useAppState.ts`;
    - the pass-through in `page.tsx`.

- [ ] **Step 4: Run the tests again.** Run `npm test && npx tsc --noEmit`. Expected: PASS, no type errors.

- [ ] **Step 5: Commit.** `git commit -m "Match API: hide existing 1v1 chats, return the full ranked list"`

---

### Task 2: Match tab searches on open, verse-while-you-wait, Show More

**Files:**
- Modify:
  - `src/lib/home-tabs.ts` (pure helpers)
  - `src/lib/home-tabs.test.ts` (create the file if it does not exist)
  - `src/app/page.tsx` (Match section 485–660, `EMPTY_BY_RULE` 27–45, `Skeletons`)
  - `src/components/VerseCard.tsx`
  - `src/app/globals.css`

**Interfaces:**
- Consumes: `emptyReason.rule === 'chatted'` (Task 1); `DuoResult` without `existing_chat_room_id`.
- Produces:
  - `MATCH_PAGE = 20`
  - `shouldAutoSearch(s: { tab: Tab; hasSearch: boolean; tooFew: boolean; signedIn: boolean; alreadyFired: boolean }): boolean`
  - `pageOf<T>(items: T[], shown: number): { visible: T[]; remaining: number }`
  - `VerseCard({ verse, compact }: { verse: Verse | null; compact?: boolean })`

- [ ] **Step 1: Write the failing tests** in `home-tabs.test.ts`

```ts
const base = { tab: 'matches' as const, hasSearch: false, tooFew: false, signedIn: true, alreadyFired: false };
it('auto-searches on the Match tab with no search yet', () => expect(shouldAutoSearch(base)).toBe(true));
it('never on another tab, with a search, with < 3 habits, signed out, or twice', () => {
  for (const o of [{ tab: 'home' as const }, { hasSearch: true }, { tooFew: true }, { signedIn: false }, { alreadyFired: true }])
    expect(shouldAutoSearch({ ...base, ...o })).toBe(false);
});
it('pageOf: 20 items show all, nothing remaining', () => {
  expect(pageOf(Array.from({ length: 20 }, (_, i) => i), MATCH_PAGE)).toMatchObject({ remaining: 0 });
});
it('pageOf: 21 items show 20 then 1 remaining; next page shows 21', () => {
  const xs = Array.from({ length: 21 }, (_, i) => i);
  expect(pageOf(xs, 20)).toMatchObject({ remaining: 1 });
  expect(pageOf(xs, 40).visible).toHaveLength(21);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/lib/home-tabs.test.ts`. Expected: FAIL (`shouldAutoSearch` is not exported).

- [ ] **Step 3: Implement the helpers, then wire `page.tsx`**
  - **Auto search:**
    - **Placement:** every new hook (`autoFired`, `hadSearch`, `shown`, both effects) goes above the early returns at page.tsx:~260 and ~274. Compute `const tooFewForSearch = (currentUser?.tags.length ?? 0) < 3` there; `tooFew` at ~300 sits below the returns. Declare both effects after the `viewerRef` effect (~179-181). Otherwise, on a reload of `/?tab=matches`, `runSearch` captures a null viewer and drops its own result, leaving the tab stuck on loading.
    - Keep `autoFired = useRef(false)` and `hadSearch = useRef(false)`.
    - One effect resets `autoFired.current = false` only when `search` goes from non-null to null (tracked with `hadSearch`). StrictMode's re-run then cannot undo the guard.
    - A second effect, when `shouldAutoSearch(...)` is true, sets `autoFired.current = true` and then always defers the call with `queueMicrotask(() => void runSearch('duo'))`, the pattern already used for `setNow`. (`useEffectEvent` is an acceptable alternative.)
  - **Loading block** (replaces `{search?.status === 'loading' && <Skeletons />}`):
    - `<div className="match-wait">` containing `<VerseCard verse={verse} compact />`.
    - Then `<p className="wait-line" role="status"><span className="pulse-dot" aria-hidden="true" />{copy}</p>`. `copy` is `Finding people who share your habits…` for duo and `Finding groups that fit your habits…` for pods.
    - Then the existing `<Skeletons />`.
    - While loading, the header `.sub` shows `Matched on your {n} habits` instead of the loading copy, so the copy isn't said twice.
  - **VerseCard `compact`:**
    - Heading text `Today’s verse`, with id from `useId()` (the full card keeps `votd-h`).
    - Class `verse-card vc-compact`: padding `14px 16px 16px`, verse text one step smaller than the full card.
    - Same photo and shade, so light and dark both work unchanged.
  - **CSS:**
    - `.ubf .wait-line`: flex, gap 8px, `font-weight: 600`, same text colour as the header `.sub`.
    - `.ubf .pulse-dot`: 8px circle, `background: var(--u-accent)`, a scale/opacity pulse keyframe of 1.4s.
  - **Show More:**
    - `const [shown, setShown] = useState(MATCH_PAGE)`, reset to `MATCH_PAGE` inside `runSearch`.
    - Render `pageOf(duoRes or podRes, shown).visible`.
    - When `remaining > 0`, render below the grid `<p className="small">Showing {visible.length} of {total}</p>` and `<Btn variant="btn-outline" onClick={() => setShown(s => s + MATCH_PAGE)}>Show More</Btn>`.
  - **Empty copy:**
    - Keep the `place`, `age` and `language` entries (the SQL is still strict until Task 4).
    - Add `chatted: { text: 'You’ve already started chats with everyone who matches right now. Try Groups, or check back soon.', button: 'Search Groups' }`. It has no `href`, so the existing Search Groups button branch handles it.

- [ ] **Step 4: Run the tests again.** Run `npm test && npx tsc --noEmit && npx eslint src/app/page.tsx src/components/VerseCard.tsx src/lib/home-tabs.ts`. Expected: PASS, clean.

- [ ] **Step 5: Commit.** `git commit -m "Match tab: search on open, verse while you wait, Show More"`

- [ ] **Step 6: Browser check** on the dev server (`npm run dev`, demo sign-in), with DevTools Network filtered to `api/match`:
  - **Searches once:** each of these sends exactly one request:
    - tab bar → Match;
    - Home 1v1 tile;
    - reload of `/?tab=matches`;
    - open a chat, then the browser's Back to `/?tab=matches`.
    - The room's own back link (`<Link href="/">`) lands on Home and sends no request; that is expected.
  - **Loading screen:** shows the verse card, the status line and placeholders, in light and in dark.
  - **Show More:** appears only when there are more than 20 results.
  - **Fewer than 3 habits:** sends no request and shows the note.
  - **Empty states:** check the empty state wherever demo data produces one. Check the "chatted" copy if a demo viewer can reach it; otherwise report it as not verified.
  - Note any StrictMode double requests you see.

---

### Task 3: Soft age, place and language scoring

**Files:**
- Modify:
  - `src/lib/matching/score.ts` (types 10–40, `placeScore` 173–184, `ageScore` 186, `buildReasons` 239–243, `scorePair`, `scorePod`)
  - `src/lib/matching/score.test.ts`
  - `src/lib/matching/load.ts` (`profile_private` select at ~171, the `match:` object at ~276)
  - `src/lib/matching/load.test.ts`
  - `src/lib/matching/rank.test.ts` (its `MatchPerson` fixtures). The `maxDistanceKm:` grep also finds non-`MatchPerson` files (LifeFitFields, life-fit, profile-update.test); leave those alone.

**Interfaces:**
- Produces:
  - `MatchPerson` gains `languages: string[]; ageMin: number | null; ageMax: number | null`.
  - `MatchWeights.life` gains `language?: number`, where missing means 0.
  - `Place.inPerson` is true only when meeting in person works.

- [ ] **Step 1: Write the failing tests** in `score.test.ts`.
  - Add `languages: ['en'], ageMin: 18, ageMax: 99` to the `person()` defaults.
  - `const life = (a, b, c = ctx()) => scorePair(a, b, c).breakdown.lifeFit`.

```ts
describe('soft rules', () => {
  const far = { cityId: 2, cityName: 'London', lat: 51.5, lng: -0.13 }; // ~270 km from Leeds
  it('place table: same city, in-person-only vs online-only -> place 0, no same_city reason', () => {
    const a = person(), b = person({ id: 'q', meetMode: 'online' });
    expect(life(a, b)).toBe(Math.round(100 * (0.35 + 0.35 + 0 + 0.15)));
    expect(scorePair(a, b, ctx()).reasons.some((r) => r.kind === 'life' && r.detail === 'same_city')).toBe(false);
  });
  it('place table: in-person-only beyond the limit vs both -> place 0', () => {
    expect(life(person(), person({ id: 'q', meetMode: 'both', ...far }))).toBe(Math.round(100 * (0.35 + 0.35 + 0 + 0.15)) /* both aged 30: age part 1 */);
  });
  it('place table: both allow online, different cities -> time-zone score (as today)', () => { /* both 'both', far, tz 0 -> place 1 */ });
  // in person works -> unchanged: the existing in-person and distance tests must keep passing untouched.
  it('outside either age range -> age part 0, never higher than inside', () => {
    const inside = life(person(), person({ id: 'q', age: 32 }));
    const outside = life(person({ ageMin: 18, ageMax: 30 }), person({ id: 'q', age: 32 }));
    expect(outside).toBeLessThan(inside);
  });
  it('missing age range scores the age part 0', () => { /* ageMin null -> same as outside */ });
  it('language part is 0 without a shared language and is weightless until weights v2', () => {
    const v2 = ctx({ weights: { ...weights, version: 2, life: { ...weights.life, language: 0.15 } } });
    const shared = life(person(), person({ id: 'q' }), v2);
    const none = life(person(), person({ id: 'q', languages: ['hi'] }), v2);
    expect(none).toBeLessThan(shared);
    expect(life(person(), person({ id: 'q', languages: ['hi'] }))).toBe(life(person(), person({ id: 'q' }))); // v1: no effect
  });
  it('shown score is at least 1', () => {
    const zero = ctx({ weights: { ...weights, total: { faith: 0, interests: 1, life: 0 } } });
    const r = scorePair(person({ tags: [pick('chess')] }), person({ id: 'q', tags: [pick('baking')] }), zero);
    expect(r.score).toBe(1);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/lib/matching/score.test.ts`. Expected: FAIL on the place, age and language cases.

- [ ] **Step 3: Implement**
  - **Place:** `inPersonWorks = both allow in person && km <= limit + 1e-6`; `onlineWorks = both allow online`.
    - `inPersonWorks` returns `{ score: sameCity ? 1 : (limit > 0 ? clamp01(1 - km / limit) : 0), inPerson: true }`.
    - Else `onlineWorks` returns the tz score with `inPerson: false`.
    - Else `{ score: 0, inPerson: false }`.
  - **Age:** age fit is 0 unless all four range values are present and each age sits inside the other person's range; otherwise it is today's `1 - |Δ|/10`.
  - **Language:** score 1 if the two language lists intersect, otherwise 0. Add it to the Life Fit `wmean` with weight `w.life.language ?? 0`.
  - **Reasons:** `buildReasons` emits `same_city` or `distance` only when `place.inPerson`.
  - **Minimum %:** `scorePair` and `scorePod` return `score: Math.max(1, Math.round(...))`.
  - **Loading:** in `load.ts`, select `age_min, age_max` from `profile_private` and fill `languages`, `ageMin` and `ageMax`. `pub` is unchanged.
  - **Other tests:** update any existing test whose expectation the place table changes, with a one-line comment saying why. `online place score…` stays at 85 and needs no change.

- [ ] **Step 4: Run the tests again.** Run `npm test && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Scoring: soft age, place and language; minimum 1%"`

---

### Task 4: Migration 0019, its check script, and Life Fit wording

**Files:**
- Create:
  - `supabase/migrations/0019_soft_match_rules.sql`
  - `supabase/tests/0019_soft_match_rules_check.sql` (rolled back; follow `supabase/tests/0017_unread_counts_check.sql`)
- Modify:
  - `src/components/LifeFitFields.tsx:131,254`
  - `scripts/check-filters.ts:140-168` (it asserts the old hard filters)
  - `src/lib/matching/empty-reason.ts`, `src/lib/matching/empty-reason.test.ts`
  - `src/app/page.tsx` (`EMPTY_BY_RULE`)
- Branch: first `git checkout -b feature/match-0019` from the Task 3 head.

**Interfaces:**
- Consumes: weights `life.language` (Task 3), and the unchanged signatures of all four functions:
  - `match_candidates(uuid, text, int)`
  - `match_pod_candidates(uuid, int)`
  - `duo_pair_allowed(uuid, uuid)`
  - `pod_join_allowed(uuid, uuid)`

- [ ] **Step 1: Write the check script first** (one `begin; … rollback;` transaction with `assert`s).
  - **Seed:** a viewer (adult, complete) and these candidates:
    - **A:** same gender, different language, outside the viewer's age range, 300 km away;
    - **B:** same gender, aged 16 by birth date;
    - **C:** same gender, no city;
    - **D:** different gender;
    - **E:** same gender and an existing duo chat with the viewer. The API hides E, not the SQL.
  - Also seed F, a viewer aged 16, and a pod whose member has no city.
  - The database may hold other users, so assert membership, not exact lists.
  - **Asserts:**
    - `match_candidates` returns A and E, not B, C or D.
    - F gets no candidates.
    - The pod with the no-city member is absent from `match_pod_candidates`.
    - `duo_pair_allowed(viewer, A)` is true; for B, C and D it is false.
    - A pod whose member is B is absent from `match_pod_candidates`, and `pod_join_allowed` is false for it.
    - The active `match_weights` row has `version = 2` and `config->'life'->>'language' = '0.15'`.

- [ ] **Step 2: Write the migration** in one file. No `begin; … commit;`: no migration in 0001–0017 has one, and the Supabase CLI runs each file itself.
  - **New function `public.match_safe(uid uuid) returns boolean`** (`language sql stable security definer set search_path = ''`), written as `select exists (...)`, so a missing row gives false, not null. It is true when all of these hold:
    - the profile is onboarded;
    - `profile_private.birth_date <= current_date - interval '18 years'`. Do not write `age(...) >= interval '18 years'`: Postgres compares intervals with a 30-day month, so it lets someone through the day before their 18th birthday;
    - `coalesce(cardinality(profiles.languages), 0) > 0`;
    - `location_city_id` is not null.
    - Revoke it from `public, anon, authenticated` and grant it to `service_role`.
  - **The four functions:** `create or replace` each with the identical signature, keeping the parameter names and defaults (`viewer`, `kind`, `lim int default 300`; `viewer`, `lim int default 100`; `viewer`, `other`; `viewer`, `pod`) and the return type. The RPC callers pass named arguments.
    - **Duo** (`match_candidates`, `duo_pair_allowed`): `ok_gender and ok_tradition and match_safe(viewer) and match_safe(cand)`.
    - **Pod** (`match_pod_candidates`, `pod_join_allowed`): the member set is `cand where ok_tradition and match_safe(cand)`, plus `match_safe(viewer)`. The fellowship, status and seat clauses stay as they are.
    - Header comment: the soft rules moved to scoring, and `match_rule_flags` and `match_filter_counts` are untouched.
  - **Weights:** insert version 2 with `jsonb_set(jsonb_set(config, '{life,language}', '0.15'), '{version}', '2')` from version 1, `on conflict (version) do nothing`. Then `update match_weights set is_active = (version = 2) where version in (1, 2)`, so exactly one row is active whatever the conflict did. `load.ts:370` throws if none is active.

- [ ] **Step 3: App changes that only make sense once the SQL is soft**
  - `RULE_ORDER = ['gender', 'tradition']`. Rewrite the empty-reason tests that blamed age, language or place:

```ts
it('soft rules are never blamed', () => {
  expect(pickEmptyReason(rows(5, { age: 0, language: 0, place: 0 }))).toBeNull();
});
it('blames gender or tradition when nobody passes it', () => {
  expect(pickEmptyReason(rows(5, { tradition: 0 }))).toEqual({ rule: 'tradition', passing: 0 });
  expect(pickEmptyReason(rows(5, { gender: 0, tradition: 0 }))).toEqual({ rule: 'gender', passing: 0 });
});
```

  - Delete the `place`, `age` and `language` entries from `EMPTY_BY_RULE` in `page.tsx`.
  - **Life Fit wording:**
    - Distance hint: `We show people nearer you first. Only you can see this.`
    - Age hint: `Required. We show closer ages first. Only you can see this.`

- [ ] **Step 4: Verify locally** (local Docker database only).
  - Run `npm test && npx tsc --noEmit`. Expected: PASS.
  - Update `scripts/check-filters.ts` to the new rules: soft rules no longer exclude; the 18+, complete-profile, gender, fellowship and tradition rules still do.
  - First confirm the dev app does not use the local Docker stack (`grep -c "127.0.0.1\|localhost" .env.local` prints 0 when it points at the hosted project). If it does use it, stop: the reset would wipe that data.
  - Run `npx supabase start && npx supabase db reset`, then the 0019 check script with `psql -v ON_ERROR_STOP=1` against the local database URL from `npx supabase status`, then `npx tsx scripts/check-filters.ts`. Expected: every migration applies and every assert passes.
  - Check by eye that each `create or replace` header matches 0009/0012 exactly.
  - **Never point either SQL file at the hosted database.**
  - Applying the migration and running the check script on `jqfgqglxesixnczieges` wait for the owner. First run `npx supabase projects list` and confirm the project.
  - If 0018 isn't applied by then, the later 0018 push may need `--include-all`.

- [ ] **Step 5: Commit.** `git commit -m "Migration 0019: soft match rules with 18+ and complete-profile safety"`

# Match tab: search on open, show everyone, hide existing chats (Part 2) — design

Date: 2026-11-21. Status: draft for owner review. Size: a project (database migration, match API, scoring, Match tab UI). Part 1 (Verse of the Day + photo tiles) shipped on 2026-11-20.

## Intent

The owner wants Match to feel instant and generous:
- Opening the tab starts a search right away, with a pleasant loading screen.
- Everyone who can be matched shows up, even at 1–2%.
- People the viewer already has a 1v1 chat with don't appear again.

Today the tab is empty until a button is tapped. Results are near-empty because five hard filters stack: age range, language, place, gender and tradition.

## Goals

- **Search on open.** Opening Match starts a 1v1 search when no results are on screen. That covers the tab bar, the Home tiles and the `?tab=matches` link. Tapping the Groups segment starts a Groups search, as it does today.
- **Strict rules are only the ones the owner named:**
  - 1v1 pairs the same gender.
  - Each person's fellowship mode is respected: a 1v1 needs both people on `both` or `duo_only`, and a group needs the viewer on `both` or `group_only`.
  - "Only my tradition" applies when either person has it on.
  - The existing eligibility rules stay: both onboarded, same demo-ness, not yourself.
  - **Safety rules (my call; they keep what the old filters did quietly):**
    - Both people are 18 or older by birth date.
    - Both have a complete profile for matching: a birth date, at least one language and a city.
    - The old age filter was the only thing keeping a minor away from adults, because everyone's age range starts at 18 or above.
    - The old filters also dropped anyone with missing fields.
    - Both rules apply in search and in Connect/Join.
- **Everything else only lowers the %:** age range, distance, in-person vs online (including the time-zone check) and language.
- **Hidden from 1v1 results:** anyone with an existing 1v1 chat with the viewer, meaning a `duo_matches` row with a `chat_room_id`, in either direction. Groups the viewer is in stay hidden, as today.
- **Show everyone:** the API returns the whole ranked list. The tab shows 20 at a time with a Show More button.
- **Search and Connect/Join always agree.** The eligibility checks from migration 0012 (`duo_pair_allowed`, `pod_join_allowed`) are relaxed in the same migration as the search.

## Non-goals

- No new filter controls, sorting options, pull-to-refresh or infinite scroll.
- No Groups search on open: Groups waits for a tap.
- No change to how chats are created or to the card designs, apart from Show More.

## Anti-goals (a failure even if it works)

- A card for someone the viewer then can't Connect with, because search and Connect disagree.
- Someone you already chat with appearing as a new match.
- A score that goes up because a factor is missing or mismatched. Each case the old filters excluded must score lower, never higher.
- Card wording that reveals someone's private settings. Age range and travel distance are promised private, so cards may show only public facts or the viewer's own settings, never "outside their age range".
- A loading screen that fakes progress, such as a made-up percentage or step count.

## Decisions

### Made by the owner (2026-11-20)

- The strict rules and the soft rules listed under Goals.
- Hide anyone with an existing 1v1 chat. Groups you're in are already hidden.
- Relax migration 0012's Connect/Join check together with the search. That is a database change, and applying it needs owner approval.

### Night picks (advisor, 2026-11-20 ~23:55 IST; the owner can reverse any)

- **In-person vs online and time zone are soft.** The owner's strict list is closed, so everything else only lowers the %.
- **Show everyone, 20 at a time with Show More.**
- **Loading screen B, "verse while you wait":**
  - today's verse card in compact form;
  - a "Finding friends who share your habits" line with a small pulsing dot;
  - placeholders shaped like the real result cards.
  - The mockup is `.superpowers/brainstorm/…/match-loading.html`. Motion stops under `prefers-reduced-motion`.

### My calls (the builder may refine within these)

- **How much the soft rules lower the % (night pick 4, advisor):** mismatches lower the Life Fit part only. There is no multiplier or cap on the total.
  - The owner's words were "only lower the %", and the cards show the Faith / Interests / Life Fit bars, which a multiplier on the total would contradict.
  - With today's weights, Life Fit is 25% of the total, and place and age are 15% each inside it. Each can cost at most about 3.75 points.
  - With language added at the same weight, place, age and language together can cost at most about 10 points. A pair that is strong on faith and habits can still show around 90%.
  - The owner can ask for a stronger effect later; that is a weights change, not a redesign.
- **Score effects of the soft rules,** in `src/lib/matching/score.ts`:
  - **Age:** inside both people's preferred ranges, the age part works as today. Outside either range, it is 0. Today's age part already reaches 0 at ten years apart, so tests check "never higher, and lower when the part was above 0".
  - **Place** follows the old `ok_place` rule. Meeting in person works when both allow it (`in_person` or `both`) and they are within the smaller travel limit. Meeting online works when both allow it (`online` or `both`).

    | Case | Old filter | New place score |
    |---|---|---|
    | In person works, same city | pass | 1 (as today) |
    | In person works, different cities | pass | `1 - km / limit` (as today) |
    | In person doesn't work, online works | pass if time zones ≤ 180 min apart | time-zone score as today (0 at 180 min or more) |
    | Neither works, e.g. in-person-only vs online-only (even in the same city), or in-person-only beyond the limit while the other is `both` | fail | **0** (today some of these get 1 or a high time-zone score) |

    Each row gets a test. `buildReasons` keeps the distance and same-city lines only when meeting in person works.
  - **Language:** a new Life Fit part, 1 when they share a language and 0 when they don't.
    - The weights live in the database (`match_weights`, active row, version 1), so migration 0019 adds version 2: a copy of version 1 with `life.language = 0.15`, made active.
    - The code treats a missing `life.language` weight as 0, so nothing changes until the migration is applied.
    - Side effect: once version 2 is active, pairs who share a language go up a point or two.
  - **New scoring inputs:** `MatchPerson` gains `languages`, `ageMin` and `ageMax`, loaded in `loadPeople` from `profiles.languages` and `profile_private.age_min` / `age_max`.
    - `ageMin` and `ageMax` are scoring-only. The card data (`pub`) stays an explicit allow-list, so they are never sent to the browser. `languages` is already public on cards; unchanged.
    - A missing age range scores the age part 0.
  - A missing value must never be dropped in a way that raises the score. Life Fit fields are required, so a gap is a bug, and the gap scores 0.
  - **Card reasons** (`buildReasons`): the distance line stays limited to pairs within the travel limit. No reason line is ever added for a mismatch.
- **Groups:**
  - The viewer must be on `both` or `group_only`. Other members' fellowship modes don't matter, as today.
  - Gender is not applied.
  - Tradition is checked against each member, applying when the viewer or that member has "Only my tradition" on.
  - Age, language and place stop being per-member filters. `scorePod` already blends each member's pair score (lowest 50%, average 30%, plus anchor habits 20%), so the soft rules lower a group's % with no pod scoring change.
  - Groups also show 20 at a time with Show More. The pod query's cap of 100 stays.
- **After Connect:**
  - Connect opens an active chat straight away: `start_or_get_duo_chat` has no accept step.
  - The browser's Back from that chat remounts Home on `?tab=matches` (the app doesn't keep pages alive), so the Match tab runs one fresh search. The person just connected is now a chat partner and drops out of the list. The room's own back link goes to Home and runs no search.
  - The room lookup the API does after ranking, and the `existing_chat_room_id` field with its "Continue with …" button, become dead once existing chats are hidden. They are removed (plan ruling). A stale card still works: Connect calls `start_or_get_duo_chat`, which returns the existing room.
- **Consequence for the owner to know:** because Connect has no accept step, someone's own age range and travel distance no longer stop other people opening a chat with them. Fellowship mode, gender and "Only my tradition" still do.
- **Shown %:** at least 1. A real match that rounds to 0% would read like an error.
- **Hiding existing chats** happens in the match API, before ranking. The API loads the viewer's `duo_matches` that have rooms and leaves those people out. This needs no database change, so it can ship before the migration.
- **Search-on-open trigger:** when the tab becomes `matches`, the viewer has at least 3 habits, and there is no search for the current viewer yet. With fewer than 3 habits, the existing "Pick at least 3 habits" note shows instead. Coming back to the tab keeps the results already shown. Tapping a segment searches again, as today. Pressing Back from a chat must not start a duplicate search.
- **Show More** reveals the next 20 from results already loaded.
  - `match_events` keeps logging only the first 20 as `shown`, so the events stay true to what was seen.
  - Cost: a Connect on a row past 20 records its outcome with no score (`outcomes.ts` copies the score from the latest `shown` event). That is acceptable for now; noted for the owner.
- **Empty states:**
  - With fewer rules, the only rules that can empty the list are gender (with fellowship mode) and tradition. `empty-reason.ts` drops age, language and place from `RULE_ORDER`.
  - `match_filter_counts` keeps its SQL and its return shape (`rule, passing`), so the migration doesn't touch it.
  - Until the migration is applied, an empty list caused by a soft rule shows the generic copy.
  - **New case:** everyone eligible is already someone you chat with. The API reports that, and the tab says so with its own copy (e.g. "You've started chats with everyone who matches right now"), not the generic empty state.
- **Loading screen behaviour:** the verse shows only while loading. When results land, the whole loading block (verse, status line, placeholders) is swapped for the results at the top of the list. That is a swap at the top of the page, not a stable layout; the mockup's "doesn't jump" line overstated it.
- **Life Fit wording** in `src/components/LifeFitFields.tsx`:
  - The age hint becomes "Required. We show closer ages first. Only you can see this."
  - The distance hint becomes "We show people nearer you first. Only you can see this."
- **Migration number:** `0019_soft_match_rules.sql`, because 0018 is reserved for the read watermark.
  - It replaces `match_candidates`, `match_pod_candidates`, `duo_pair_allowed` and `pod_join_allowed` with `create or replace`, keeping their argument and return types so grants are kept.
  - `match_rule_flags` and `match_filter_counts` stay as they are.
  - It adds the safety rules (18+, complete profile) and the version 2 weights row.
  - It is written, reviewed and run on the local Docker database on the branch, and applied to the hosted database only with owner approval. It stays off `main` until then.
  - If 0019 is applied before 0018 exists on the hosted database, the later 0018 push may need `supabase db push --include-all`. Noted for the owner.
- **Release order:**
  1. App changes first: search on open, loading screen, hiding chats, Show More, the new scoring and the new wording. All of these are safe while the SQL is still strict.
  2. Then the migration, which relaxes search and Connect/Join in one transaction so they never disagree.
  - Apply 0019 only after the build with the new scoring is live. Relaxed SQL with the old scorer would give mismatched pairs high scores.
  - The empty-state change (dropping age, language and place) and the Life Fit wording ship with 0019 on branch `feature/match-0019`, because they are only true once the SQL is soft.
  - Each step records the live version first. Push and deploy need owner approval.
- **Under-18s:**
  - Sign-up blocks them in `/api/auth/age`, which deletes the account.
  - **Pre-existing gap, flagged for the owner, not fixed here:** the `profile_private_insert_own` / `profile_private_update_own` policies let a signed-in user write their own row directly through the database API, `birth_date` included, so that check can be bypassed.
  - What the 18+ rule can and can't do: it keeps out anyone whose stored birth date is under 18, including someone who writes their real date straight into the database to skip the deletion. No check can stop someone who lies about their birth date, at sign-up or by a direct write.
  - The direct write also lets a user change their birth date after sign-up, which the app refuses. Pinning `birth_date` for the API roles with a trigger, like `pin_is_demo_account` in 0005, is a separate owner decision.
- **The SQL cap stays at 300,** ordered by shared habits (`pre_rank`). Once the pool is bigger than that, the people cut are those with the fewest shared habits. That is fine at today's size, but worth knowing.

## Approaches considered

1. **Relax the database filter to the strict rules only, and move age, place and language into the score (picked).** One source of truth for eligibility. The Connect/Join check is relaxed in the same migration.
2. **Keep the strict filter and add a relaxed fallback query when results are few.** Two code paths, and Connect would still refuse the fallback people.
3. **Drop the database filter and filter in TypeScript.** It loads every profile on every search, and the Connect/Join check would drift from the search.

## How we know it's done

- **Unit tests in `score.test.ts`:**
  - each formerly excluded case scores no higher than the same pair without it, and strictly lower whenever the affected part was above 0: outside the age range, in-person vs online mismatch, beyond the travel limit, no shared language;
  - every row of the place table;
  - no missing value raises a score;
  - the shown % is at least 1.
- **Unit tests for the API ranking helpers:**
  - existing-chat partners are excluded;
  - the whole list is returned;
  - "everyone is already a chat" is reported as its own empty case.
- **SQL:**
  - The migration is reviewed. It must keep each function's argument and return types, and keep the 18+ and complete-profile rules in all four functions.
  - After the owner applies it, check against the hosted database:
    - demo users who were filtered out before now appear, and Connect works for them;
    - a profile under 18 or missing a city still never appears.
- **Browser checks of the Match tab:**
  - opening from the tab bar, the Home tiles and a reload of `?tab=matches` searches exactly once;
  - Back from a chat does not search again;
  - the loading screen in light and dark;
  - Show More;
  - the empty state.
- `npm test` passes in full, and the Cloudflare build passes.

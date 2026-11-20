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
  - **Place** scores 0 when no way of meeting works:
    - one person in-person-only and the other online-only;
    - both in-person only and farther apart than the smaller travel limit. Today this case falls back to the time-zone score, which can be high.
    - When both allow online (`online` or `both`), the time-zone score is used as today.
    - The in-person distance score inside the limit is unchanged.
  - **Language:** a new Life Fit part, 1 when they share a language and 0 when they don't.
    - The weights live in the database (`match_weights`, active row, version 1), so migration 0019 adds version 2: a copy of version 1 with `life.language = 0.15`, made active.
    - The code treats a missing `life.language` weight as 0, so nothing changes until the migration is applied.
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
  - Back from that chat keeps the list as it was. The person stays on screen until the next search, and tapping Connect again reopens the same chat, because the function returns the existing room.
  - The room lookup the API does after ranking becomes unnecessary once existing chats are hidden. Whether to drop it and the `existing_chat_room_id` field is the builder's call.
- **Consequence for the owner to know:** because Connect has no accept step, someone's own age range and travel distance no longer stop other people opening a chat with them. Fellowship mode, gender and "Only my tradition" still do.
- **Shown %:** at least 1. A real match that rounds to 0% would read like an error.
- **Hiding existing chats** happens in the match API, before ranking. The API loads the viewer's `duo_matches` that have rooms and leaves those people out. This needs no database change, so it can ship before the migration.
- **Search-on-open trigger:** when the tab becomes `matches`, the viewer has at least 3 habits, and there is no search for the current viewer yet. With fewer than 3 habits, the existing "Pick at least 3 habits" note shows instead. Coming back to the tab keeps the results already shown. Tapping a segment searches again, as today. Pressing Back from a chat must not start a duplicate search.
- **Show More** reveals the next 20 from results already loaded. `match_events` keeps logging only the first 20 as `shown`, so the events stay true to what was seen.
- **Empty states:** with fewer rules, the only things that can empty the list are gender, fellowship mode and tradition. `match_filter_counts` and `empty-reason.ts` change to name only those.
- **Life Fit wording** in `src/components/LifeFitFields.tsx`:
  - The age hint becomes "Required. We show closer ages first. Only you can see this."
  - The distance hint becomes "We show people nearer you first. Only you can see this."
- **Migration number:** `0019_soft_match_rules.sql`, because 0018 is reserved for the read watermark. It replaces `match_candidates`, `match_pod_candidates`, `match_filter_counts`, `duo_pair_allowed` and `pod_join_allowed` with `create or replace`, so grants are kept, and `match_rule_flags` stays as it is. It is written and reviewed on the branch, and applied only with owner approval.
- **Release order:**
  1. App changes first: search on open, loading screen, hiding chats, Show More, the new scoring and the new wording. All of these are safe while the SQL is still strict.
  2. Then the migration, which relaxes search and Connect/Join in one transaction so they never disagree.
  - Each step records the live version first. Push and deploy need owner approval.
- **Under-18s:** sign-up already blocks them on the server (`/api/auth/age` deletes the account; age-range inputs are 18–99), so making age soft can't pair an adult with a minor.
- **The SQL cap stays at 300,** ordered by shared habits (`pre_rank`). Once the pool is bigger than that, the people cut are those with the fewest shared habits. That is fine at today's size, but worth knowing.

## Approaches considered

1. **Relax the database filter to the strict rules only, and move age, place and language into the score (picked).** One source of truth for eligibility. The Connect/Join check is relaxed in the same migration.
2. **Keep the strict filter and add a relaxed fallback query when results are few.** Two code paths, and Connect would still refuse the fallback people.
3. **Drop the database filter and filter in TypeScript.** It loads every profile on every search, and the Connect/Join check would drift from the search.

## How we know it's done

- **Unit tests in `score.test.ts`:**
  - each formerly excluded case scores no higher than the same pair without it, and strictly lower whenever the affected part was above 0: outside the age range, in-person vs online mismatch, beyond the travel limit, no shared language;
  - no missing value raises a score;
  - the shown % is at least 1.
- **Unit tests for the API ranking helpers:** existing-chat partners are excluded, and the whole list is returned.
- **SQL:** the migration is reviewed. After the owner applies it, check against the hosted database that demo users who were filtered out before now appear, and that Connect works for them.
- **Browser checks of the Match tab:**
  - opening from the tab bar, the Home tiles and a reload of `?tab=matches` searches exactly once;
  - Back from a chat does not search again;
  - the loading screen in light and dark;
  - Show More;
  - the empty state.
- `npm test` passes in full, and the Cloudflare build passes.

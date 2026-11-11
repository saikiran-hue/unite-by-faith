# Task 17 report: demo seed v2 and end-to-end verification

Status: DONE (local only). Owner gate: 0011 is NOT applied to hosted; nothing pushed.

## Changes
- `supabase/migrations/0011_demo_seed_v2.sql` (R20: 0010 was taken). Updates the 8 existing demo profiles in place
  (is_demo_account=true, languages, city id, meet_mode, life_stage, availability, tradition_id, faith_stage),
  upserts profile_private (4 men, 4 women, age ranges 22-45, 50 km), upserts 4 extra tags that make related pairs
  (Joshua trail-running <-> Micah hiking; Abigail piano-and-keyboard <-> Hannah guitar; Rebecca classic-literature <->
  Hannah/Lydia book-club; Daniel board-games <-> Caleb chess) and sets levels (priority = 3, core faith = 3, a few casual = 1).
  Idempotent, touches only the 8 demo ids, deletes nothing. No new auth users were needed (R21 moot): the 8 gender-balanced
  demo users already give 3 same-gender candidates each. It repeats the 0005 token-column fix (harmless).
- `scripts/check-demo-matches.ts`: signs in as each demo account (LOCAL=1 only), prints duo/pod counts, requires >=2 each and >=1 related_tag.
- Two bugs found in the browser walk-through and fixed:
  1. `src/app/page.tsx`: the home page stays mounted across sign-out and demo sign-in (cacheComponents), so the previous viewer's
     1v1/group results showed for the next viewer (Daniel saw Caleb's results). Results now reset when the viewer id changes.
  2. `src/app/onboarding/page.tsx`: the habit picker listed 28 inactive legacy tags (e.g. "Indie & Acoustic Worship");
     picking one made Finish Setup fail with "One of those habits isn't available". Now filtered by is_active.

## Per-viewer results (local, after `npx supabase db reset`)
| Viewer | duo | pods |
|---|---|---|
| Caleb Mathew | 3 | 2 |
| Hannah Grace Thomas | 3 | 2 |
| Daniel Paul Varghese | 3 | 2 |
| Abigail Joy Chen | 3 | 3 |
| Micah D'Souza | 3 | 2 |
| Lydia Fernandes | 3 | 3 |
| Joshua Prakash | 3 | 3 |
| Rebecca Samuel | 3 | 3 |

11 results carry a related_tag reason. check-demo-matches PASS.

## Verification
- npm test 123/123; tsc 0 errors; eslint 0 errors (2 pre-existing warnings); check-identity LOCAL=1 27 PASS / 0 FAIL; check-filters exit 0 (all PASS).
- Browser walk-through, local stack, desktop (500px) then 320px dark emulation (scrollWidth 320 throughout):
  1 sign-up at 17 refused (message shown); 2 adult sign-up -> onboarding; 3 life fit, habits search ("prayer"), level Passionate, star, save;
  4 Search 1v1 / Search Groups (real non-demo user: empty state "Nobody in your age range yet" as designed; demo viewers get cards);
  5 Connect 1v1 then message; 6 events logged; 7 switch demo profiles (Switch Profile menu and demo list); 8 sign out (/api/state 401).
- match_events via psql: shown 64 rows; connected + replied for Caleb->Daniel and Lydia->Hannah (replied is logged for the non-connector's first reply).

## Concerns
- Switching profile from the profile menu while inside a chat room updates the session but the room view stays on the old user until reload (not fixed; edge case).
- Demo users only match demo users, so a fresh real account sees the empty state by design.
- Hosted: apply 0011 only after owner approval. DEMO_ACCOUNT_PASSWORD is unused by the demo flow (it uses /api/auth/switch mode demo).
- Ages are from fixed birth dates; age ranges are wide so they stay valid for years.

## Fix round 1
1. Onboarding: retired picks are dropped from picked/starred at load (fillFrom takes the retired set) and the Note "A habit you picked is no longer offered and was removed." shows; tagsChanged already compares against the saved set by size, so a dropped pick counts as a change and saving removes it. Verified locally: Rebecca given a retired tag shows the Note and counts 10 picks, not 11.
2. 0011: closing auth.users token update scoped to the 8 demo ids.
3. Home page: a viewer ref (updated in an effect) lets runSearch discard results if the viewer changed mid-flight (a direct searchSeq bump in an effect fails the React compiler lint rule).
4. 0011: location_city set for every demo row (Bengaluru, Chennai, Pune, Kochi, New Delhi) so label and id agree.
Re-run: npm test 123/123, tsc 0, eslint 0 errors, db reset applies 0011, check-demo-matches PASS (3 duo / 2-3 pods each, 11 related), check-identity 0 FAIL.

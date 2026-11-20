# Home: Verse of the Day + photo match cards (Part 1) — design

Date: 2026-11-20. Status: approved by the owner 2026-11-20. Size: small change (Home only, no backend, no database).

## Intent

The owner wants Home to feel beautiful and faith-first. Scripture comes first: a Verse of the Day sits at the very top of Home in the style of the owner's reference screenshot (a photo with a dark shade, "Verse of the Day", the reference, the verse in a serif face). Below it, the 1v1 Match and Group Match buttons become photo cards with a shade: two friends praying for 1v1, four friends talking for Group. It must look right on every device.

This is Part 1 of two. Part 2 (Match tab: auto-search, loading screen, show everyone, hide existing 1v1 chats) follows as its own design and release.

## Goals

- One verse per day, the same for everyone, changing at the viewer's local midnight.
- Verse card first on Home, above the match buttons, on phone, tablet and desktop.
- 1v1 and Group buttons show a relevant photo under a shade, with their text still easy to read.
- Light and dark themes both work, and so do 320 px width and 200% zoom.

## Non-goals

- No Share button, likes, comments, notifications or verse history. Nobody asked for them (advisor pick).
- No change to matching, the API or the database. Those belong to Part 2.
- No new pages or tabs.

## Anti-goals (a failure even if it works)

- A verse typed from memory, misquoted or cut off mid-sentence.
- Photos that look like dating, a pastor praying over a congregant, or a stock-photo template.
- Photo cards that push the match buttons out of the first screen on a small phone.

## Decisions

### Made by the owner

- Layout A: a big verse card on top, then 1v1 and Group as photo tiles side by side, then Create Group, then Recent Messages. On desktop the verse spans the full width above the two columns. See the mockup `.superpowers/brainstorm/…/home-layout.html`.
- Verse source: a hand-picked list of 366 verses stored in the app, in the BSB (Berean Standard Bible, public domain). There is no live API call when the page loads.
- 1v1 photo: two friends of the same gender praying (1v1 only pairs the same gender).
- Order: Part 1 (verse and Home photos) ships first; Part 2 comes after.

### Advisor picks (the owner delegated the choice; each can be reversed)

- **Card size.** The verse card sizes to its text; there is no fixed tall height. On a 360×640 phone the top of the match tiles must still show.
- **1v1 photo follows the viewer's gender** (`currentUser.private.gender`, already on the client): women see two women praying, men see two men praying.
  - A neutral fallback, Pexels 6860819 (two friends holding open Bibles, faces out of frame), is used whenever gender is null or that gender has no approved photo yet.
  - Approved photos must show two peers of the same gender praying together. No clergy vestments, no couple framing.
  - Rejected: Pexels 8817491, because it shows a pastor in a stole praying over a woman.
  - Part 1 does not wait for these photos: an unapproved gender gets the fallback.
- **Group photo:** Pexels 8111273 (four friends talking at a table, juice and snacks). At phone tile width at least 3 of the 4 people must stay visible, so set the crop focus near the centre.
- **Verse background:** the sky-only top crop of the app's existing cross-on-a-hill photo (`PHOTOS.hero`), so no cross sits behind the text at any screen size. Changed 2026-11-20 (night decision, advisor): in the browser the cross landed behind the verse on phones and cropped to dark rock on desktop. One photo every day; no rotation.
- **Shade colours keep the brand rule:** a black shade on the 1v1 photo and a dark green (`#052e12`) shade on the Group photo. The Group icon circle keeps the green gradient.
- **Disabled state** (fewer than 3 habits): the tiles keep their photos, shown greyscale and dimmed, and are not clickable. The existing "Pick at least 3 habits" note stays below them.
- **Verse text is never typed by hand.**
  - I pick the 366 references (well-known, encouraging, complete sentences, at most 240 characters).
  - A one-off script pulls each one's BSB text from bible-api.com, about one request every 2 s, with a retry when the site rate-limits it. It cleans the text (collapses whitespace, removes the stray closing quote mark the API leaves at the end) and writes a data file that is committed.
  - The app never calls the API.
- **Keys and timing.** The list is keyed by month and day (`MM-DD`, including `02-29`). The local date is read in an effect, not during render, the same way chat times read `now` today, so the server and browser render the same thing. Until the date is known the card shows its photo with placeholder lines.
- **Markup.**
  - The verse sits in a labelled section ("Verse of the Day") holding a blockquote, with the reference and "BSB" as its caption.
  - Photos are decorative (empty alt text), and the buttons keep their text labels.
  - Text on photos must reach 4.5:1 contrast against the shaded area behind it.

## Approaches considered (verse source)

1. **List in the app (picked).** Instant, works offline, can't break, no licence risk. Changing the list needs a deploy.
2. **List plus a live bible-api.com fetch.** Depends on a free hobby API with rate limits, for text that never changes.
3. **A third party picks the verse** (OurManna NIV / labs.bible.org NET). Odd picks (Psalm 139:15–16, which starts mid-sentence), NIV copyright terms, and an outage risk.

## Photo hosting (owner decision)

- Self-host in `public/images/home/`. The owner approved downloading about 4 free photos (~150 KB each) from Pexels/Unsplash, sized for 2x screens.

## Left to the builder

- Exact radii, spacing and type sizes, within the existing `.ubf` tokens. The verse uses `--font-verse` (Lora).
- Rewriting the desktop `.home-panel` grid: the verse takes a full-width first row, with the match tiles and Create Group on the left and Recent Messages on the right.
- The loading skeleton gains a verse-card placeholder.

## How we know it's done

- Unit tests on the verse list:
  - exactly 366 unique `MM-DD` keys;
  - no empty text, every entry at most 240 characters, quote marks balanced, no doubled spaces;
  - `verseFor(date)` returns the entry for the viewer's local date, including 29 February.
- Visual check in the running app, at 320, 360, 768, 1024 and 1440 px, in light and dark mode:
  - the verse card is first;
  - the match tiles start on the first screen at 360×640;
  - text is readable over the photos;
  - the disabled state looks right.
- `npm test` passes in full, and the build passes.

## Part 2 (next design; owner decisions already made)

- **Strict rules:**
  - 1v1 stays same-gender, and each person's fellowship mode is respected.
  - "Only my tradition" applies when someone turns it on.
  - Age, distance and language only lower the %.
  - Everyone else shows, even at 1–2%.
- **Hidden from 1v1 results:** anyone you already have a 1v1 chat with. Groups you're in are already hidden.
- **Match tab:** opening it searches 1v1 right away (Groups when tapped), with a better loading screen.
- **Database dependency:** the Connect/Join eligibility check (migration 0012) mirrors `match_candidates`, so both must be relaxed together. That is a database change and needs owner approval to apply.

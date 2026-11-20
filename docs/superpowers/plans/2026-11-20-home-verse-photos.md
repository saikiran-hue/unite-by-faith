# Home: Verse of the Day + Photo Match Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a daily Bible verse card at the top of Home, and turn the 1v1 Match and Group Match buttons into photo cards with a shade.

**Architecture:**
- A committed 366-entry verse list (BSB text, generated once by a script from bible-api.com) plus a pure `verseFor(date)` lookup.
- The Home page renders a `VerseCard` from the date it already reads in an effect.
- Self-hosted photos in `public/images/home/` sit under CSS shades inside the existing hero buttons.
- No backend, API or database change.

**Tech Stack:** Next.js 16 App Router (client page), React 19, TypeScript, plain CSS under `.ubf` in `src/app/globals.css`, Vitest, `npx tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-20-home-verse-photos-design.md`

## Global Constraints

- **Next.js 16 has breaking changes.** Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (`AGENTS.md`).
- **Styling.**
  - Plain CSS in `src/app/globals.css`, scoped under `.ubf`, using the existing tokens: `--u-*` colours, `--r-tile` (28px) radius, `--font-verse` (Lora) for verse text. No Tailwind, no new dependencies.
  - Copy rules: no emoji, no exclamation marks, Title Case labels. Labels: "Verse of the Day", "1v1 Match", "Group Match".
  - Brand colours: black (ink) means 1v1, green means groups. The 1v1 photo shade is black (`rgba(10,10,10,…)`); the Group photo shade is dark green (`#052e12`, i.e. `rgba(5,46,18,…)`).
- **Verses.**
  - Translation is BSB (Berean Standard Bible, public domain). Shown reference format: `<reference> BSB`, e.g. `Joshua 1:9 BSB`.
  - The list has exactly 366 entries keyed `MM-DD`, including `02-29`. Each text is at most 240 characters and is one or more complete sentences.
  - Verse text is never typed by hand. It comes only from the fetch script. The app never calls a Bible API at runtime.
  - The verse is the same for everyone, keyed by the viewer's local date. The date is read in an effect (the existing `now` state), never during render.
- **Photos.**
  - Self-hosted under `public/images/home/`, each file at most 300 KB.
  - Rendered as decorative `<img alt="">`; buttons keep their text labels.
  - Text over photos must reach at least 4.5:1 contrast against the shade behind it.
- **Out of scope:** no Share button, likes or counts; no new pages or tabs; no change to matching, the API or the database.
- **Git:** commits are fine; never push or deploy. Branch: `feature/home-verse`.
- **Checks:**
  - Implementers run `npm test`, `npx tsc --noEmit` and `npm run lint`.
  - The controller runs `npm run build` once at the end, then restarts the dev server (building while the dev server runs breaks it).
  - Every new `<img>` gets `{/* eslint-disable-next-line @next/next/no-img-element */}` above it, as the existing ones in `page.tsx` do.

## Review Focus

1. **Midnight while Home stays open.** The card shows the new day's verse once the page next refreshes its data, which happens on return to the tab. A reload never shows yesterday's verse. Pinned by Task 2 Step 4's midnight timer and the Task 1 `msToNextDay` test.
2. **Time zone.** The card uses the device's local calendar date, not UTC; a viewer in IST at 00:30 sees the new day. Pinned by Task 1's stubbed-getter test (it fails if `verseKey` reads UTC).
3. **The longest verse at 320px width and at 200% zoom.** The card grows, never truncates and never overflows. Pinned by the Task 2 visual step using the longest entry.
4. **A photo that is slow or fails to load.** The tile shows its solid ink or dark-green background, so the white text stays readable. Pinned by the Task 3 blocked-image check.
5. **A viewer with no private row, or a gender with no approved photo.** They get the neutral two-friends-with-Bibles photo. Pinned by the Task 3 `duoPhoto` tests.

---

### Task 1: Verse list and daily lookup

**Files:**
- Create: `src/lib/verses/clean.ts`, `src/lib/verses/clean.test.ts`
- Create: `scripts/verse-refs.ts` (the hand-picked references, edited by hand)
- Create: `scripts/fetch-verses.ts` (writes `src/lib/verses/data.ts`)
- Create (generated): `src/lib/verses/data.ts`
- Create: `src/lib/verses/index.ts`, `src/lib/verses/verses.test.ts`

**Interfaces:**
- Produces:
  - `export interface Verse { ref: string; text: string }` from `src/lib/verses/index.ts`.
  - `export function verseKey(date: Date): string`: the local `MM-DD`.
  - `export function verseFor(date: Date): Verse`.
  - `export function msToNextDay(date: Date): number`: milliseconds until the next local midnight.
  - `export function cleanVerseText(raw: string): string` from `clean.ts`.
  - `export const VERSES: Record<string, Verse>` from `data.ts`.

- [ ] **Step 1: Write the failing `cleanVerseText` tests** in `src/lib/verses/clean.test.ts`. The inputs are real bible-api.com outputs. A verse that starts or ends inside a quotation gets its missing quote mark completed at the edge; the words never change:

```ts
expect(cleanVerseText('For where two or three gather together in My name, there am I with them.”'))
  .toBe('“For where two or three gather together in My name, there am I with them.”');
expect(cleanVerseText('Do not be afraid; do not\nbe discouraged,  for the LORD your God is with you.'))
  .toBe('Do not be afraid; do not be discouraged, for the LORD your God is with you.');
expect(cleanVerseText('“Come to Me, all you who are weary and burdened, and I will give you rest.'))
  .toBe('“Come to Me, all you who are weary and burdened, and I will give you rest.”');
expect(cleanVerseText('“For I know the plans I have for you,” declares the LORD, “plans to prosper you.'))
  .toBe('“For I know the plans I have for you,” declares the LORD, “plans to prosper you.”');
expect(cleanVerseText('to you,” says the LORD, “and peace.')).toBe('“to you,” says the LORD, “and peace.”');
expect(cleanVerseText('Jesus said, “I am the way.” Amen.')).toBe('Jesus said, “I am the way.” Amen.'); // balanced: untouched
expect(cleanVerseText('Don’t be afraid.')).toBe('Don’t be afraid.'); // curly apostrophe kept
```

- [ ] **Step 2: Run** `npx vitest run src/lib/verses/clean.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `cleanVerseText`.**
  - Collapse every whitespace run, including newlines, to one space, and trim.
  - Scan left to right with a depth counter: `“` adds 1; `”` subtracts 1, or, at depth 0, counts as an unmatched close.
  - Prepend one `“` per unmatched close, and append one `”` per level still open at the end. The result is always properly nested.
  - Leave `‘` and `’` alone.

- [ ] **Step 4: Run the clean tests.** Expected: PASS.

- [ ] **Step 5: Write `scripts/verse-refs.ts`.**
  - It exports `VERSE_REFS: { key: string; ref: string }[]` with 366 entries, one per `MM-DD` from `01-01` to `12-31` including `02-29`. `ref` is a bible-api.com query such as `joshua 1:9` or `philippians 4:6-7`.
  - Pick by these rules:
    - well-known and encouraging, readable on its own without the surrounding chapter;
    - one or more complete sentences, at most 240 characters in BSB;
    - no reference used twice;
    - a mix of Old and New Testament, with no more than 3 days in a row from the same book;
    - suitable for every Christian tradition.

- [ ] **Step 6: Write `scripts/fetch-verses.ts`** and run it with `npx tsx scripts/fetch-verses.ts`.
  - For each entry, GET `https://bible-api.com/<encodeURIComponent(ref)>?translation=bsb`.
  - Store `{ ref: <response.reference>, text: cleanVerseText(<response.text>) }`.
  - Wait 2200 ms between requests; the site allows 15 per 30 s. On HTTP 429, wait 30 s and retry, at most 3 times per entry, then stop with an error naming the entry.
  - Treat a non-OK response, or a body without a non-empty `text`, as a failure for that entry: log it, keep going, and list all failures at the end.
  - Cache by query at `node_modules/.cache/fetch-verses.json` (`{ [query]: { ref, text } }`), written after every successful fetch. Re-runs only fetch queries not yet cached, and a late failure loses nothing.
  - Build `data.ts` from the cache once every entry has a result.
  - Write `src/lib/verses/data.ts` with this header comment: `// Generated by scripts/fetch-verses.ts from bible-api.com (BSB, public domain). Do not edit by hand.`
  - Print every entry that breaks a Step 7 rule.
  - A full run takes about 14 minutes; run it in the background.

- [ ] **Step 7: Write the failing data and lookup tests** in `src/lib/verses/verses.test.ts`:

```ts
const all = Object.entries(VERSES);
it('has one verse for every day of a leap year', () => {
  const days: string[] = [];
  for (let d = new Date(2024, 0, 1); d.getFullYear() === 2024; d.setDate(d.getDate() + 1)) days.push(verseKey(d));
  expect(Object.keys(VERSES).sort()).toEqual(days.sort());
  expect(days).toHaveLength(366);
});
it('never repeats a reference', () => expect(new Set(all.map(([, v]) => v.ref)).size).toBe(366));
it('keeps every verse whole and short', () => {
  for (const [key, v] of all) {
    expect(v.text.length, key).toBeGreaterThan(0);
    expect(v.text.length, key).toBeLessThanOrEqual(240);
    expect(v.text, key).not.toMatch(/\s{2}|\n/);
    let depth = 0;
    for (const ch of v.text) {
      if (ch === '“') depth++;
      if (ch === '”') depth--;
      expect(depth, key).toBeGreaterThanOrEqual(0);
    }
    expect(depth, key).toBe(0);
    expect(v.text, key).toMatch(/^[“A-Z]/);
    expect(v.text, key).toMatch(/[.!?]”?$/);
  }
});
it('uses the local calendar date', () => {
  expect(verseKey(new Date(2026, 0, 1, 0, 30))).toBe('01-01');
  expect(verseKey(new Date(2026, 11, 31, 23, 59))).toBe('12-31');
  expect(verseFor(new Date(2024, 1, 29, 12))).toEqual(VERSES['02-29']);
  expect(verseFor(new Date(2026, 6, 4, 8))).toEqual(VERSES['07-04']);
  // Local getters, never UTC: this fails if verseKey calls getUTCMonth/getUTCDate.
  const d = new Date(Date.UTC(2026, 0, 1, 12));
  d.getMonth = () => 6;
  d.getDate = () => 4;
  expect(verseKey(d)).toBe('07-04');
});
it('counts down to the next local midnight', () => {
  expect(msToNextDay(new Date(2026, 4, 10, 23, 59, 30))).toBe(30_000);
  expect(msToNextDay(new Date(2026, 4, 10, 0, 0, 0))).toBe(86_400_000);
});
```

- [ ] **Step 8: Implement `verseKey`, `verseFor` and `msToNextDay`** in `src/lib/verses/index.ts`. `verseKey` uses the local `getMonth()` and `getDate()`, zero-padded. `msToNextDay` returns `new Date(y, m, d + 1).getTime() - date.getTime()`.

- [ ] **Step 9: Make the tests pass.**
  - Run `npx vitest run src/lib/verses`. Expected: PASS.
  - For any failing entry, change its `ref` in `verse-refs.ts` and re-run the script. Never edit `data.ts` by hand.

- [ ] **Step 10: Commit** with the message `Verses: 366-day BSB list and local-date lookup`. Stage all seven files: `src/lib/verses/clean.ts`, `clean.test.ts`, `index.ts`, `verses.test.ts`, `data.ts`, `scripts/verse-refs.ts` and `scripts/fetch-verses.ts`.

### Task 2: Verse card at the top of Home

**Files:**
- Create: `public/images/home/verse-sky.jpg`
- Create: `src/lib/home-photos.ts`
- Create: `src/components/VerseCard.tsx`
- Modify: `src/app/page.tsx` (the Home section around lines 375–452, and the loading skeleton around lines 250–270)
- Modify: `src/app/globals.css` (the home rules near lines 465–483, and the desktop block near lines 724–727)

**Interfaces:**
- Consumes: `Verse`, `verseFor` and `msToNextDay` from `@/lib/verses` (Task 1).
- Produces:
  - `export const HOME_PHOTOS = { verse: '/images/home/verse-sky.jpg' }` from `src/lib/home-photos.ts`. Task 3 adds `group`.
  - `export function VerseCard({ verse }: { verse: Verse | null })`.

- [ ] **Step 1: Download the verse photo.** This is the app's existing `PHOTOS.hero`.

```bash
mkdir -p public/images/home
curl -sSfL -o public/images/home/verse-sky.jpg "https://images.unsplash.com/photo-1528825539566-2bcb5882445c?w=1600&auto=format&fit=crop&q=72&fm=jpg"
ls -l public/images/home/verse-sky.jpg   # expect under 300 KB; lower q until it is
```

- [ ] **Step 2: Create `src/lib/home-photos.ts`.**
  - It holds `HOME_PHOTOS.verse = '/images/home/verse-sky.jpg'`.
  - Add one source comment per photo: the Unsplash page URL and "Unsplash License, free to use".

- [ ] **Step 3: Implement `VerseCard`.** Markup:
  - `<section className="card verse-card" aria-labelledby="votd-h">`.
  - The photo as `<img className="vc-bg" alt="" src={HOME_PHOTOS.verse}>`, plus a shade layer.
  - A small visible heading: `<h2 id="votd-h" className="vc-label">Verse of the Day</h2>`.
  - Then `<figure>` holding `<figcaption className="vc-ref">{ref} BSB</figcaption>` followed by `<blockquote className="vc-text"><p>{text}</p></blockquote>`.
  - With `verse === null`, render the same frame with three `.skel` lines in place of the figure, and `aria-busy="true"` on the section.

- [ ] **Step 4: Place it in `page.tsx`.**
  - Derive `const verse = now ? verseFor(now) : null;` from the existing `now` state.
  - Add one effect, mounted once, that keeps `now` current:
    - a `setTimeout` for `msToNextDay(new Date())` that calls `setNow(new Date())` and schedules the next one;
    - a `visibilitychange` listener that calls `setNow(new Date())` when the page becomes visible;
    - cleanup clears the timer and removes the listener.
    The verse then turns over at local midnight even if Home stays open.
  - Render `<VerseCard verse={verse} />` as the second child of the Home section, after `.greet` and before `.hero-btns`.
  - In the loading skeleton, add a `<span className="skel" style={{ height: 200, borderRadius: 28 }} />` between the title bar and `.hero-btns`.

- [ ] **Step 5: Style it in `globals.css`.**
  - The card is `position: relative; overflow: hidden; isolation: isolate; color: #fff` with a dark fallback background (`#1c1712`).
  - `.vc-bg` (`z-index: -2`) covers the card. The shade (`::before`, `z-index: -1`) covers the whole card: `linear-gradient(180deg, rgba(10,8,6,.55) 0%, rgba(10,8,6,.62) 50%, rgba(10,8,6,.8) 100%)`, so the top label is covered too.
  - Label 13px/600, reference 16px/700, verse in `--font-verse` at 20px with line-height 1.45.
  - Height comes from content; there is no `min-height`.
  - Crop the photo so the cross sits low in the card and never under the verse text: `object-position: center bottom`, plus bottom padding of up to 72px on phones as the band where the cross shows. On a 360×640 phone the top of the match tiles must still show with the longest verse.
  - At the desktop breakpoint (`@media (min-width: 1024px)`):
    - the verse text is 24px with `max-width: 40ch`;
    - rewrite `.home-panel` with five explicit rows, `grid-template-rows: auto auto auto auto 1fr`;
    - `.greet` (row 1) and `.verse-card` (row 2) span both columns (`grid-column: 1 / -1`);
    - `.hero-btns` (row 3) and the create row or `tooFew` card (row 4) sit in column 1;
    - `.recent-card` is `grid-column: 2; grid-row: 3 / -1`;
    - check this both with and without the `tooFew` card.

- [ ] **Step 6: Verify.**
  - Run `npx tsc --noEmit && npm run lint && npm test`. Expected: all pass.
  - Then the controller (not the implementer) checks on `localhost:3000`, signed in as a demo user:
    - at 360×640 the card is first under the greeting and the top of the match buttons still shows;
    - at 320px and at 200% zoom, with `VERSES` temporarily pointed at the longest entry, nothing truncates or overflows (revert afterwards);
    - at 1024px and 1440px the verse spans the top and Recent Messages sits on the right;
    - light and dark themes both look right;
    - the console shows no hydration warning.

- [ ] **Step 7: Commit** with the message `Home: Verse of the Day card on top`. Stage the photo, `home-photos.ts`, `VerseCard.tsx`, `page.tsx` and `globals.css`.

### Task 3: 1v1 and Group photo cards

**Files:**
- Create: `public/images/home/group-friends.jpg`, `public/images/home/duo-bibles.jpg`
- Modify: `src/lib/home-photos.ts`
- Create: `src/lib/home-photos.test.ts`
- Modify: `src/app/page.tsx` (the two `.hero-btn` buttons)
- Modify: `src/app/globals.css` (the `.hero-btn` rules near lines 467–477)

**Interfaces:**
- Consumes: `HOME_PHOTOS` (Task 2); `currentUser.private?.gender` (`'man' | 'woman' | null`, from `src/types/database.ts`).
- Produces:
  - A `group: '/images/home/group-friends.jpg'` entry added to `HOME_PHOTOS`.
  - `export const DUO_NEUTRAL = '/images/home/duo-bibles.jpg'`.
  - `export const DUO_BY_GENDER: Partial<Record<'man' | 'woman', string>> = {}`. It starts empty; photos are added later, once they pass the spec's rules.
  - `export function duoPhoto(gender: 'man' | 'woman' | null | undefined, byGender = DUO_BY_GENDER): string`.

- [ ] **Step 1: Write the failing tests** in `src/lib/home-photos.test.ts`:

```ts
expect(duoPhoto(null)).toBe(DUO_NEUTRAL);
expect(duoPhoto(undefined)).toBe(DUO_NEUTRAL);
expect(duoPhoto('man', {})).toBe(DUO_NEUTRAL);
expect(duoPhoto('woman', { woman: '/images/home/duo-women.jpg' })).toBe('/images/home/duo-women.jpg');
expect(duoPhoto('man', { woman: '/images/home/duo-women.jpg' })).toBe(DUO_NEUTRAL);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/home-photos.test.ts`. Expected: FAIL.

- [ ] **Step 3: Download the photos and implement `duoPhoto`.**

```bash
curl -sSfL -o public/images/home/group-friends.jpg "https://images.pexels.com/photos/8111273/pexels-photo-8111273.jpeg?auto=compress&cs=tinysrgb&w=1200"
curl -sSfL -o public/images/home/duo-bibles.jpg "https://images.pexels.com/photos/6860819/pexels-photo-6860819.jpeg?auto=compress&cs=tinysrgb&w=1000"
ls -l public/images/home/   # each under 300 KB
```

  Add a source comment per photo: the Pexels page URL and "Pexels License, free to use". `duoPhoto` returns `byGender[gender]` when gender is set and has an entry, otherwise `DUO_NEUTRAL`.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Put the photos in the buttons and style them.**
  - In each `.hero-btn`, add `<img className="hero-photo" alt="" src={…}>` as the first child. 1v1 uses `duoPhoto(currentUser.private?.gender)`; Group uses `HOME_PHOTOS.group`. The icon tile and text stay as they are.
  - CSS:
    - The button is `position: relative; overflow: hidden; isolation: isolate; color: #fff; min-height: 196px`.
    - `.hero-photo` covers the button with `object-fit: cover` behind a `::before` shade.
    - Shades reach at least .6 opacity before the text block starts:
      - 1v1 `linear-gradient(180deg, rgba(10,10,10,.15) 0%, rgba(10,10,10,.35) 30%, rgba(10,10,10,.65) 50%, rgba(10,10,10,.9) 100%)`;
      - Group `linear-gradient(180deg, rgba(5,46,18,.15) 0%, rgba(5,46,18,.35) 30%, rgba(5,46,18,.7) 50%, rgba(5,46,18,.94) 100%)`.
    - Fallback backgrounds while a photo loads: 1v1 `var(--u-ink)` in light theme and `#111` in dark theme; Group `#052e12`.
    - Drop the Group glow. The 1v1 icon circle is `rgba(10,10,10,.55)` with a white icon; the Group icon circle keeps `var(--grad)` with `var(--u-on-accent)`.
    - Group crop: set `object-position` so at least 3 of the 4 people show at 360px.
    - Disabled (`[disabled]`): the photo turns `filter: grayscale(1)` at `opacity: .55` under an even neutral shade `rgba(0,0,0,.55)`; text stays white; `cursor: not-allowed`.

- [ ] **Step 6: Verify.**
  - Run `npx tsc --noEmit && npm run lint && npm test`. Expected: all pass.
  - The controller checks on `localhost:3000`:
    - at 320, 360, 768, 1024 and 1440px and at 200% zoom, in light and dark themes, the white text is readable and nothing overflows;
    - the press scale still works;
    - with the image requests blocked in devtools, the text sits on the solid ink or dark-green fallback;
    - a demo user with fewer than 3 habits sees the greyed tiles, which do nothing when tapped.

- [ ] **Step 7: Commit** with the message `Home: photo cards for 1v1 and Group Match`. Stage the two photos, `home-photos.ts`, `home-photos.test.ts`, `page.tsx` and `globals.css`.

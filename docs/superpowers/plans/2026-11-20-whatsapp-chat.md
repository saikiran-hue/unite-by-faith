# WhatsApp-style Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reply, edit (15 min), delete (anytime, wipes text and its pin), reactions, unread badges, read ticks, typing indicator and date separators in Unite by Faith chats.

**Architecture:** Migration 0016 adds three columns to `chat_messages`, two tables (`message_reactions`, `room_reads`), an `unread_counts` function and Realtime Authorization policies for a private typing channel. All writes stay in `POST /api/rooms/[roomId]` (service role, after membership check); the rules live in pure, unit-tested modules under `src/lib/chat/`. The room page renders the new data and refetches on Realtime events as today.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres, RLS, Realtime postgres_changes + broadcast), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-whatsapp-chat-design.md`

## Global Constraints

- Reactions are exactly `🙏 ❤️ 👍 😂 🙌`, one per person per message; tapping your current one removes it (stored as `emoji = null`, never a row delete).
- Edit: own `text` messages only, within `15 * 60 * 1000` ms of `created_at`, not deleted. Delete: own message, any type, any age.
- Delete sets `deleted_at = now()`, `content = ''`, `metadata = '{}'`, clears its reactions, and deletes the `room_pins` row named by `metadata.pin_id` only when that pin's `author_id` is the sender and `room_id` is this room.
- Copy: deleted bubble text "This message was deleted"; edited label "edited"; confirm "Delete this message for everyone?" with buttons "Delete" / "Cancel"; reply bar "Replying to {first name}"; edit bar "Editing message", send button label "Save"; typing "{A} is typing…", "{A} and {B} are typing…", "Several people are typing…".
- No edit history, no last-seen/online, no per-message seen-by lists.
- Applying 0016 to the hosted project and deploying each need explicit owner approval. The local Supabase stack has no seed data, so it only proves the migration applies cleanly over 0001–0015 (`open -a Docker`, `supabase start`, `supabase db reset`). Behaviour checks run against hosted with the demo accounts (which only ever see demo rooms) after the owner approves applying 0016; old clients ignore the new columns, so applying it before the app ships is safe.
- Every new action is keyboard and screen-reader reachable; destructive delete is confirmed.

## Review Focus

1. Edit exactly at the 15-minute boundary and one second past it → allowed at `<= 15 min`, refused after (`edit_window_passed`). Test in Task 2.
2. Reacting to, replying to or editing a message someone just deleted → 409 `message_deleted` / 400 `reply_target_invalid`, never a crash. Test in Task 2.
3. Client-supplied `metadata.pin_id` pointing at someone else's pin, then deleting the message → that pin survives. Test in Task 2 (`pinIdToDelete` returns the id; the route's delete filters by `author_id` and `room_id`) and in Task 3's local check.
4. A reply quote of a multi-line or 2,000-character message → one line, at most 80 characters plus "…". Test in Task 2.
5. Typing and read events from yourself → never shown as "You are typing" and never count towards your own unread badge. Test in Task 4 (`typingText` ignores nothing itself, so the hook filters `user_id === me`; `unread_counts` excludes `sender_id = p_user`, checked in Task 1's local SQL).

---

### Task 1: Migration 0016

**Files:**
- Create: `supabase/migrations/0016_chat_features.sql`

**Interfaces:**
- Produces: columns `chat_messages.reply_to_id uuid null references chat_messages(id) on delete set null`, `edited_at timestamptz null`, `deleted_at timestamptz null`; table `message_reactions(message_id uuid not null references chat_messages(id) on delete cascade, user_id uuid not null references profiles(id) on delete cascade, room_id uuid not null references chat_rooms(id) on delete cascade, emoji text null check (emoji is null or emoji in ('🙏','❤️','👍','😂','🙌')), created_at timestamptz not null default now(), primary key (message_id, user_id))` with index on `room_id`; table `room_reads(room_id uuid references chat_rooms(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, last_read_at timestamptz not null, primary key (room_id, user_id))`; function `public.unread_counts(p_user uuid) returns table(room_id uuid, unread int)` (security definer, `search_path = ''`, execute for `service_role` only).

- [ ] **Step 1: Write the migration.** Follow the style of `0012_room_authorisation.sql` (idempotent `if not exists` / `drop policy if exists`). Contents, in order:
  1. The three `chat_messages` columns.
  2. Both tables, RLS enabled, one select policy each for `authenticated` using `public.is_room_member(room_id)`; no insert/update/delete policies.
  3. Add both tables to `supabase_realtime` (same `do $$ … duplicate_object` pattern as 0001).
  4. `unread_counts`: the viewer's rooms are pod rooms (`pods.chat_room_id` via `pod_members`, since = `pod_members.joined_at`) union 1v1 rooms (`duo_matches.chat_room_id` not null, since = `duo_matches.created_at`); count `chat_messages` with `created_at > coalesce(room_reads.last_read_at, since)`, `sender_id <> p_user`, `deleted_at is null`; only rooms with a count > 0 are returned. Revoke from `public, anon, authenticated`, grant to `service_role`.
  5. Backfill: insert `room_reads (room_id, user_id, last_read_at = now())` for every current pod member and both duo partners, `on conflict do nothing`.
  6. Realtime Authorization for typing on `realtime.messages`: one `select` and one `insert` policy for `authenticated`, both requiring `realtime.messages.extension = 'broadcast'`, `realtime.topic() ~ '^room:[0-9a-f-]{36}$'`, and `public.is_room_member(substring(realtime.topic() from 6)::uuid)`. Order the conditions so the cast only runs after the regex matches (use `case when … then … else false end`).
- [ ] **Step 2: Apply locally.** Run `open -a Docker`, wait for `docker info` to succeed, then `supabase start` and `supabase db reset`. Expected: reset finishes with no error (proves syntax and ordering). If Docker can't start, say so and continue; the hosted check below still runs.
- [ ] **Step 3: Commit** `git add supabase/migrations/0016_chat_features.sql && git commit -m "Migration 0016: replies, edits, deletes, reactions, read state, typing channel auth"`

- [ ] **Step 4: Owner gate.** Ask the owner to approve applying 0016 to the hosted project. On approval apply it and check with the service role: `rpc('unread_counts', { p_user: <Caleb demo id> })` returns only Caleb's rooms and excludes Caleb's own messages; a reaction insert with `'🔥'` is rejected; every demo member has a `room_reads` row. Without approval, stop after Task 2 and Task 4 (pure work) and wait.

### Task 2: Chat rules (pure)

**Files:**
- Create: `src/lib/chat/rules.ts`, `src/lib/chat/rules.test.ts`
- Modify: `src/types/database.ts` (types below)

**Interfaces:**
- Produces in `src/types/database.ts`: `export type ReactionEmoji = '🙏' | '❤️' | '👍' | '😂' | '🙌'`; `ChatMessage` gains `reply_to_id: string | null; edited_at: string | null; deleted_at: string | null; reply_to?: ReplyQuote | null; reactions?: ReactionCount[]`; `export interface ReplyQuote { id: string; sender_name: string; snippet: string; deleted: boolean }`; `export interface ReactionCount { emoji: ReactionEmoji; count: number; mine: boolean }`; `export interface MemberRead { user_id: string; last_read_at: string | null; joined_at: string }`.
- Produces in `rules.ts`:
  - `EDIT_WINDOW_MS = 900_000`, `REACTIONS: readonly ReactionEmoji[]` in the order above.
  - `type RuleMsg = Pick<ChatMessage, 'id' | 'room_id' | 'sender_id' | 'message_type' | 'created_at' | 'deleted_at' | 'metadata'>`
  - `type Check = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string }`
  - `checkEdit(msg: RuleMsg | null, userId: string, roomId: string, now: Date): Check`
  - `checkDelete(msg: RuleMsg | null, userId: string, roomId: string): Check`
  - `checkReact(msg: RuleMsg | null, roomId: string, emoji: unknown): Check` (emoji must be `null` or one of `REACTIONS`)
  - `checkReplyTarget(parent: RuleMsg | null, roomId: string): Check`
  - `pinIdToDelete(msg: RuleMsg): string | null` (`metadata.pin_id` as string for `prayer_request` / `milestone`, else null)
  - `snippet(content: string, max = 80): string` (collapse whitespace, cut at `max` chars and append `…`)
  - Errors: missing or other room → `404 message_not_found`; not sender → `403 not_your_message`; deleted → `409 message_deleted`; non-text edit → `409 only_text_editable`; late edit → `409 edit_window_passed`; bad emoji → `400 invalid_emoji`; bad reply target (missing, other room, deleted) → `400 reply_target_invalid`.

- [ ] **Step 1: Write failing tests** in `rules.test.ts` with a base message `{ id: 'm1', room_id: 'r1', sender_id: 'me', message_type: 'text', created_at: '2026-11-20T10:00:00.000Z', deleted_at: null, metadata: {} }`:
  - `checkEdit(base, 'me', 'r1', new Date('2026-11-20T10:15:00.000Z'))` → `{ ok: true }`; at `10:15:01` → `{ ok: false, status: 409, error: 'edit_window_passed' }`.
  - edit by `'you'` → 403 `not_your_message`; edit of `message_type: 'prayer_request'` → 409 `only_text_editable`; edit of deleted → 409 `message_deleted`; `null` or `room_id: 'r2'` → 404 `message_not_found`.
  - `checkDelete` of a 3-day-old own prayer request → ok; by `'you'` → 403; already deleted → 409 `message_deleted`.
  - `checkReact(base, 'r1', '🙏')` ok, `null` ok, `'🔥'` → 400 `invalid_emoji`, deleted → 409 `message_deleted`.
  - `checkReplyTarget` deleted → 400 `reply_target_invalid`; other room → 400; ok for `icebreaker`.
  - `pinIdToDelete({ ...base, message_type: 'prayer_request', metadata: { pin_id: 'p9' } })` → `'p9'`; same metadata on a `text` message → `null`; non-string pin_id → `null`.
  - `snippet('line one\n\nline   two')` → `'line one line two'`; `snippet('x'.repeat(2000))` → 80 `x` + `'…'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/chat/rules.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `rules.ts` and the type additions.
- [ ] **Step 4: Run** `npx vitest run src/lib/chat/rules.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `git add src/lib/chat/rules.ts src/lib/chat/rules.test.ts src/types/database.ts && git commit -m "Chat rules: edit window, own-only, reactions, reply targets"`

### Task 3: Room API (actions + richer GET)

**Files:**
- Create: `src/app/api/rooms/[roomId]/chat-actions.ts`
- Modify: `src/app/api/rooms/[roomId]/route.ts`

**Interfaces:**
- Consumes: Task 2 rules and types.
- Produces: `handleChatAction(admin, roomId: string, userId: string, body: Record<string, unknown>): Promise<NextResponse | null>` (null when `body.action` is not one of its actions). Actions: `edit_message {messageId, content}` → `{ message }`; `delete_message {messageId}` → `{ ok: true }`; `react {messageId, emoji: ReactionEmoji | null}` → `{ ok: true }`; `mark_read {}` → `{ ok: true }`. The existing `message` action accepts optional `replyToId` (validated with `checkReplyTarget`; stored in `reply_to_id`).
- GET adds: each message gets `reply_to` (parents fetched by id in one query, including parents outside the 200-message window; `sender_name` = sender's first name from profiles; `snippet` via `snippet()`; `deleted` from `deleted_at`), `reactions` (one query on `message_reactions` for the loaded message ids, `emoji is not null`, grouped in `REACTIONS` order with `mine`); room-level `reads: MemberRead[]` for the other members (`joined_at` = `pod_members.joined_at` or `duo_matches.created_at`, `last_read_at` from `room_reads` or null).

- [ ] **Step 1: Implement** `chat-actions.ts`. Fetch the message with `.eq('id', messageId).eq('room_id', roomId)`; run the rule; on `ok: false` return `NextResponse.json({ error }, { status })`. Edit trims content and refuses empty (400 `Message content cannot be empty`, same as send). Delete: update `deleted_at`, `content: ''`, `metadata: {}`; set `emoji = null` on its reactions; if `pinIdToDelete` gives an id, `delete from room_pins where id = … and author_id = userId and room_id = roomId`. React: `upsert({ message_id, user_id, room_id, emoji }, { onConflict: 'message_id,user_id' })`. Mark read: upsert `room_reads` with `last_read_at: new Date().toISOString()`.
- [ ] **Step 2: Wire** `route.ts`: call `handleChatAction` after the membership check and return its response when non-null; add `replyToId` handling to `message`; add the GET enrichment (keep existing fields unchanged).
- [ ] **Step 3: Verify against hosted** (needs Task 1 Step 4; local dev server, demo accounts Caleb and Hannah, who share the Kingdom AI pod): as one member, send, reply, edit within the window, react twice with different emojis then the same one (ends with no reaction), delete a prayer request and confirm its pin is gone from GET `pins`; as a second member, try to edit and delete the first member's message → 403. Send a `message` with `metadata: { pin_id: <other member's pin id> }` as `prayer_request`, delete it, and confirm the other member's pin is still in `pins`.
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 5: Commit** `git commit -am "Room API: reply, edit, delete, react, mark read; GET returns quotes, reactions, reads"` (add `chat-actions.ts` first).

### Task 4: Chat status helpers (pure)

**Files:**
- Create: `src/lib/chat/status.ts`, `src/lib/chat/status.test.ts`
- Modify: `src/lib/home-tabs.ts` (export the existing `daysAgo`)

**Interfaces:**
- Produces:
  - `isSeen(createdAt: string, others: MemberRead[]): boolean` — true when at least one other member joined at or before `createdAt` and every such member has `last_read_at >= createdAt`.
  - `dayLabel(iso: string, now: Date): string` — `Today`, `Yesterday`, weekday name for 2–6 days ago, else `12 Nov` (uses `daysAgo`).
  - `dayKey(iso: string): string` — local `YYYY-MM-DD`, used to place separators.
  - `typingText(names: string[]): string | null` — 0 → null; 1 → `"Hannah is typing…"`; 2 → `"Hannah and Daniel are typing…"`; 3+ → `"Several people are typing…"`.
- [ ] **Step 1: Write failing tests**: `isSeen` false with no qualifying member; false when one of two members hasn't read; true when both read at or after; a member who joined after `createdAt` is ignored; `last_read_at: null` counts as unseen. `dayLabel` with now = `new Date(2026, 10, 20, 15)`: same day `Today`, previous day `Yesterday`, `2026-11-17` → `Tuesday`, `2026-10-21` → `21 Oct`. `typingText` for 0, 1, 2 and 3 names.
- [ ] **Step 2: Run** `npx vitest run src/lib/chat/status.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `git commit -m "Chat status helpers: seen ticks, day labels, typing text"` (add the new files first).

### Task 5: Room page UI

**Files:**
- Create: `src/components/chat/MessageItem.tsx` (one message: quote, bubble, deleted text, edited label, reactions, ticks, actions trigger), `src/components/chat/MessageMenu.tsx` (reaction bar + Reply / Copy / Edit / Delete), `src/lib/chat/useTyping.ts`
- Modify: `src/app/rooms/[roomId]/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: Tasks 2–4. `useTyping(roomId: string, me: { id: string; name: string }): { typingNames: string[]; notifyTyping: () => void }` — private channel `room:${roomId}` (`config: { private: true, broadcast: { self: false } }`, after `supabase.realtime.setAuth(token)` like the existing channel), event `typing` with payload `{ user_id, name }`; `notifyTyping` sends at most once per 3 s; names drop after 5 s without an event; ignores `user_id === me.id`.
- [ ] **Step 1: Extract** the current `renderMessage` into `MessageItem` with no behaviour change; check the room renders as before.
- [ ] **Step 2: Add** quote (`reply_to.deleted` shows "Deleted message"; `reply_to: null` with a `reply_to_id` shows no quote), `edited` label, deleted text, reaction pills (button per emoji, `aria-pressed={mine}`, label "React {emoji}, {count}"), ticks (`✓` with sr text "Sent", `✓✓` with "Seen", via `isSeen(created_at, reads)`), and date separators between messages whose `dayKey` differs (`dayLabel`, rendered as a `<li role="separator">`).
- [ ] **Step 3: Add** `MessageMenu`: opened by a "More actions" button on each non-deleted message (visible on hover/focus, always visible on touch), by long-press 450 ms, and by the context-menu key; `role="menu"`, arrow-key navigation, Escape closes and returns focus. Delete opens a confirm dialog (native `<dialog>` like `CreatePodDialog`) with the exact copy from Global Constraints.
- [ ] **Step 4: Composer**: reply bar and edit bar above the input with ✕; edit pre-fills and sends `edit_message`; reply sends `replyToId`; Escape cancels the bar. Typing line above the composer from `typingText(typingNames)`; call `notifyTyping` on input.
- [ ] **Step 5: Live updates**: subscribe to `message_reactions` and `room_reads` (`filter: room_id=eq.${roomId}`) next to the existing channels, calling `fetchRoomData(true)`. Mark read (`mark_read`) on load, after each refetch that brings a newer message while `document.visibilityState === 'visible'`, and on `visibilitychange` to visible; debounce 1 s.
- [ ] **Step 6: Check in the browser** (local dev server on hosted data): two demo users in two isolated browser contexts; reply, edit, delete with confirm, react, see ticks turn ✓✓ after the other opens the chat, see "… is typing…", see date separators. 390 px and 1440 px, light and dark. Keyboard-only pass through the menu.
- [ ] **Step 7: Run** `npx tsc --noEmit && npx vitest run && npx eslint src/app/rooms src/components/chat src/lib/chat` → clean.
- [ ] **Step 8: Commit** (add new files first) `git commit -m "Room page: message actions, reactions, quotes, ticks, typing, date separators"`

### Task 6: Unread badges

**Files:**
- Modify: `src/app/api/state/route.ts`, `src/lib/useAppState.ts`, `src/lib/home-tabs.ts`, `src/lib/home-tabs.test.ts`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 `unread_counts`.
- Produces: `/api/state` field `unread: Record<string, number>` (left out on RPC failure; the hook keeps the previous value, same as `lastMessages`); `RecentChat` gains `unread: number`; `recentChats(…, unread: Record<string, number>)` as a new last parameter.
- [ ] **Step 1: Write failing test** in `home-tabs.test.ts`: `recentChats` copies `unread[roomId]` onto each chat and defaults to 0.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (state route calls `admin.rpc('unread_counts', { p_user: userId })`). **Step 4: UI**: a count pill on chat rows when `unread > 0` (sr text "{n} unread"), bold name and preview, and a total count on the Chats tab button (sr text in its label). **Step 5: Run** `npx tsc --noEmit && npx vitest run` → PASS; check in the browser that opening a chat and coming back clears its badge.
- [ ] **Step 6: Commit** `git commit -am "Unread badges on Recent Messages, Chats and the Chats tab"`

### Task 7: Ship (owner-gated)

- [ ] **Step 1:** `npm run cf-build` succeeds; full test suite passes.
- [ ] **Step 2:** Ask the owner to approve push + deploy. On approval: `git push`, `npm run deploy`, smoke-test the live site, restart the dev server (the build overwrites `.next`).

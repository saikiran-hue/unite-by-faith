# WhatsApp-style Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reply, edit (15 min), delete (anytime, wipes text and its pin), reactions, unread badges, read ticks, typing indicator and date separators in Unite by Faith chats.

**Architecture:** Migration 0016 adds three columns to `chat_messages`, two tables (`message_reactions`, `room_reads`), service-role SQL functions that do the racy writes atomically (`delete_chat_message`, `react_to_message`, `mark_room_read`), an `unread_counts` function and Realtime Authorization policies for a private typing channel. All writes stay behind `POST /api/rooms/[roomId]` (service role, after the membership check). Rules and data shaping live in pure, unit-tested modules under `src/lib/chat/`. The room page renders the new data and refetches on Realtime events as today.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres, RLS, Realtime postgres_changes + private broadcast), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-whatsapp-chat-design.md`

## Global Constraints

- Reactions are exactly `🙏 ❤️ 👍 😂 🙌`, one per person per message; tapping your current one removes it (stored as `emoji = null`, never a row delete, so Realtime `room_id` filters keep working).
- Edit: own `text` messages only, within `15 * 60 * 1000` ms of `created_at`, not deleted. Delete: own message, any type, any age.
- Delete, in one transaction: delete the `room_pins` row named by `metadata->>'pin_id'` only when that pin's `author_id` is the sender and `room_id` is this room; set the message's reactions to `emoji = null`; set `deleted_at = now()`, `content = ''`, `metadata = '{}'`.
- Time comparisons for read state use the database clock (`now()` in SQL), never the Worker clock.
- Copy: deleted bubble and preview text "This message was deleted"; edited label "edited"; confirm "Delete this message for everyone?" with buttons "Delete" / "Cancel"; reply bar "Replying to {first name}"; edit bar "Editing message", send button label "Save"; typing "{A} is typing…", "{A} and {B} are typing…", "Several people are typing…"; quote of a deleted parent "Deleted message".
- No edit history, no last-seen/online, no per-message seen-by lists.
- Applying 0016 to the hosted project: owner approved (2026-11-20) once the local check passes and Task 1's review is clean; the controller does it between Task 3 and Task 4. Push, merge and deploy still need explicit owner approval.
- Every new action is keyboard and screen-reader reachable; destructive delete is confirmed.

## Review Focus

1. Edit exactly at the 15-minute boundary and one second past it → allowed at `<= 15 min`, refused after (`edit_window_passed`). Test in Task 2.
2. Edit or react racing a delete → the write is refused (edit's update is guarded by `deleted_at is null`; react and delete lock the row in SQL). Tests in Task 1's SQL check and Task 2.
3. Client-supplied `metadata.pin_id` pointing at someone else's pin, then deleting the message → that pin survives. Test in Task 1's SQL check.
4. A reply quote of a multi-line or 2,000-character message → one line, at most 80 characters plus "…". Test in Task 2.
5. Your own typing events and messages → never "You are typing", never counted in your unread badge. Tests in Task 3 (`activeTypers`) and Task 1's SQL check (`unread_counts` excludes `sender_id = p_user`).

---

### Task 1: Migration 0016 (local only)

**Files:**
- Create: `supabase/migrations/0016_chat_features.sql`, `supabase/tests/0016_chat_features_check.sql`

**Interfaces (produces):**
- `chat_messages` columns: `reply_to_id uuid null references public.chat_messages(id) on delete set null`, `edited_at timestamptz null`, `deleted_at timestamptz null`.
- `public.message_reactions(message_id uuid not null references public.chat_messages(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, room_id uuid not null references public.chat_rooms(id) on delete cascade, emoji text null check (emoji is null or emoji in ('🙏','❤️','👍','😂','🙌')), created_at timestamptz not null default now(), primary key (message_id, user_id))`, index on `room_id`.
- `public.room_reads(room_id uuid not null references public.chat_rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, last_read_at timestamptz not null, primary key (room_id, user_id))`.
- Functions (all `security definer`, `set search_path = ''`, `revoke … from public, anon, authenticated`, `grant execute … to service_role`):
  - `public.unread_counts(p_user uuid) returns table(room_id uuid, unread int)`.
  - `public.delete_chat_message(p_message uuid, p_user uuid, p_room uuid) returns text` → `'ok' | 'message_not_found' | 'not_your_message' | 'message_deleted'`.
  - `public.react_to_message(p_message uuid, p_user uuid, p_room uuid, p_emoji text) returns text` → `'ok' | 'message_not_found' | 'message_deleted' | 'invalid_emoji'`.
  - `public.mark_room_read(p_room uuid, p_user uuid) returns void`.

- [ ] **Step 1: Write the migration** in the idempotent style of `0012_room_authorisation.sql`, in this order:
  1. The three columns.
  2. Both tables; RLS enabled; one `select` policy each `to authenticated using (public.is_room_member(room_id))`; no write policies.
  3. Add both tables to `supabase_realtime` (the `do $$ … exception when duplicate_object` pattern from 0001).
  4. `unread_counts`: rooms = pod rooms (`pods.chat_room_id` via `pod_members` where `user_id = p_user`, `since = pod_members.joined_at`) union 1v1 rooms (`duo_matches` where `p_user in (user_a_id, user_b_id) and chat_room_id is not null`, `since = duo_matches.created_at`). Count `chat_messages` where `created_at > greatest(coalesce(rr.last_read_at, r.since), r.since)` (left join `room_reads rr on rr.room_id = r.room_id and rr.user_id = p_user`), `sender_id <> p_user`, `deleted_at is null`; return `count(*)::int`, only rooms with a count above 0.
  5. `delete_chat_message`: `select … for update` the message by id and room; return the codes above for missing / other sender / already deleted; else delete the matching pin (`id = (metadata->>'pin_id')::uuid` guarded by a UUID regex, `author_id = p_user`, `room_id = p_room`, only for `prayer_request`/`milestone`), set its reactions' `emoji = null`, wipe the message (`deleted_at = now(), content = '', metadata = '{}'`), return `'ok'`.
  6. `react_to_message`: validate `p_emoji is null or in the five`; `select … for share` the message by id and room; missing → `message_not_found`, deleted → `message_deleted`; else upsert `(message_id, user_id, room_id, emoji)` on conflict `(message_id, user_id)` set `emoji = excluded.emoji`; `'ok'`.
  7. `mark_room_read`: `insert … values (p_room, p_user, now()) on conflict (room_id, user_id) do update set last_read_at = greatest(public.room_reads.last_read_at, now())`.
  8. Backfill `room_reads` with `now()` for every current pod member (pods always have a room) and both duo partners `where chat_room_id is not null`, `on conflict do nothing`.
  9. Realtime Authorization on `realtime.messages`: a `select` policy (`using`) and an `insert` policy (`with check`), both `to authenticated`, both `realtime.messages.extension = 'broadcast' and (case when realtime.topic() ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.is_room_member(substring(realtime.topic() from 6)::uuid) else false end)`.
- [ ] **Step 2: Write the SQL check** `supabase/tests/0016_chat_features_check.sql`: one `begin; … rollback;` script that inserts two `auth.users` rows (id, email, `aud = 'authenticated'`, `role = 'authenticated'`), their `profiles`, a 1v1 room with a `duo_matches` row, three messages (one from each user plus one prayer request from user A with a pin, and one `text` message from B whose `metadata.pin_id` is A's pin), then `raise exception` (via `do $$ … $$` with `assert`) unless: `unread_counts(A)` counts only B's messages; `react_to_message` with `'🔥'` returns `invalid_emoji`; `delete_chat_message(B's text, B)` leaves A's pin; `delete_chat_message(A's prayer, B)` returns `not_your_message`; `delete_chat_message(A's prayer, A)` returns `ok`, wipes content and removes A's pin; `react_to_message` on that deleted message returns `message_deleted`; `mark_room_read` twice never moves `last_read_at` backwards.
- [ ] **Step 3: Run locally.** `open -a Docker`; wait until `docker info` succeeds; `supabase start`; `supabase db reset` → no error; run the check with `docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/0016_chat_features_check.sql` (find the container name with `docker ps`) → exits 0. If Docker cannot start, report BLOCKED with the error; do not touch the hosted project.
- [ ] **Step 4: Commit** `git add supabase/migrations/0016_chat_features.sql supabase/tests/0016_chat_features_check.sql && git commit -m "Migration 0016: replies, edits, deletes, reactions, read state, typing channel auth"`

### Task 2: Chat rules (pure)

**Files:** Create `src/lib/chat/rules.ts`, `src/lib/chat/rules.test.ts`; modify `src/types/database.ts`.

**Interfaces (produces):**
- `src/types/database.ts`: `export type ReactionEmoji = '🙏' | '❤️' | '👍' | '😂' | '🙌'`; `ChatMessage` gains `reply_to_id: string | null; edited_at: string | null; deleted_at: string | null; reply_to?: ReplyQuote | null; reactions?: ReactionCount[]`; `export interface ReplyQuote { id: string; sender_name: string; snippet: string; deleted: boolean }`; `export interface ReactionCount { emoji: ReactionEmoji; count: number; mine: boolean }`; `export interface MemberRead { user_id: string; last_read_at: string | null; joined_at: string }`; `LastMessage` gains `deleted_at: string | null`.
- `rules.ts`: `EDIT_WINDOW_MS = 900_000`; `REACTIONS: readonly ReactionEmoji[]` (order above); `type RuleMsg = Pick<ChatMessage, 'id' | 'room_id' | 'sender_id' | 'message_type' | 'created_at' | 'deleted_at'>`; `type Check = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string }`; `checkEdit(msg: RuleMsg | null, userId: string, roomId: string, now: Date): Check`; `checkReplyTarget(parent: RuleMsg | null, roomId: string): Check`; `isReaction(v: unknown): v is ReactionEmoji | null`; `rpcResult(code: string): Check` (maps the SQL codes: `ok` → ok, `message_not_found` → 404, `not_your_message` → 403, `message_deleted` → 409, `invalid_emoji` → 400, anything else → 500 is not allowed by the type, so treat unknown as `{ ok: false, status: 409, error: code }`); `snippet(content: string, max = 80): string`.
- Errors: missing/other room → `404 message_not_found`; not sender → `403 not_your_message`; deleted → `409 message_deleted`; non-text edit → `409 only_text_editable`; late edit → `409 edit_window_passed`; bad reply target (missing, other room, deleted) → `400 reply_target_invalid`.

- [ ] **Step 1: Failing tests** with base `{ id: 'm1', room_id: 'r1', sender_id: 'me', message_type: 'text', created_at: '2026-11-20T10:00:00.000Z', deleted_at: null }`: `checkEdit` at `10:15:00.000Z` ok, at `10:15:01.000Z` → `{ ok: false, status: 409, error: 'edit_window_passed' }`; by `'you'` → 403; `prayer_request` → 409 `only_text_editable`; deleted → 409 `message_deleted`; `null` and `room_id: 'r2'` → 404. `checkReplyTarget`: deleted → 400 `reply_target_invalid`; other room → 400; `icebreaker` → ok. `isReaction`: `'🙏'` and `null` true, `'🔥'` and `undefined` false. `rpcResult` for each code. `snippet('line one\n\nline   two')` → `'line one line two'`; `snippet('x'.repeat(2000))` → 80 `x` + `'…'`.
- [ ] **Step 2:** `npx vitest run src/lib/chat/rules.test.ts` → FAIL. **Step 3:** implement. **Step 4:** same command + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `git add src/lib/chat/rules.ts src/lib/chat/rules.test.ts src/types/database.ts && git commit -m "Chat rules: edit window, reply targets, reaction list, RPC codes"`

### Task 3: Chat status and data helpers (pure)

**Files:** Create `src/lib/chat/status.ts`, `src/lib/chat/status.test.ts`, `src/lib/chat/hydrate.ts`, `src/lib/chat/hydrate.test.ts`; modify `src/lib/home-tabs.ts` (export `daysAgo`).

**Interfaces (produces):**
- `status.ts`:
  - `isSeen(createdAt: string, others: MemberRead[]): boolean` — compare with `Date.parse`; true when at least one other member has `joined_at <= createdAt` and every such member has `last_read_at` not null and `>= createdAt`.
  - `dayLabel(iso: string, now: Date): string` — `Today`, `Yesterday`, weekday for 2–6 days ago, else `12 Nov` (uses `daysAgo`); `dayKey(iso: string): string` — local `YYYY-MM-DD`.
  - `typingText(names: string[]): string | null` (copy in Global Constraints; 3+ → "Several people are typing…").
  - `TYPING_SEND_MS = 3000`, `TYPING_TTL_MS = 5000`; `type TypingEvent = { user_id: string; name: string; at: number }`; `activeTypers(events: TypingEvent[], meId: string, now: number): string[]` — latest event per user, drop `meId`, drop older than `TYPING_TTL_MS`, names in first-seen order; `shouldSendTyping(lastSentAt: number | null, now: number): boolean`.
- `hydrate.ts`: `type ReactionRow = { message_id: string; user_id: string; emoji: string | null }`; `groupReactions(rows: ReactionRow[], messageId: string, meId: string): ReactionCount[]` (skip null, `REACTIONS` order, omit zero counts); `quoteFor(parent: { id: string; sender_id: string; content: string; deleted_at: string | null } | undefined, nameOf: (id: string) => string): ReplyQuote | null` (`sender_name` = first name; `snippet()`; `deleted` from `deleted_at`, snippet `''` when deleted; undefined parent → null).
- [ ] **Step 1: Failing tests.** `isSeen`: no qualifying member → false; one of two unread → false; both read at/after → true; member joined after → ignored; `last_read_at: null` → false; `'2026-11-20T10:00:00+00:00'` vs `'2026-11-20T10:00:00.000Z'` treated equal. `dayLabel` with `now = new Date(2026, 10, 20, 15)` and inputs built as `new Date(2026, 10, d, 12).toISOString()`: 20 → `Today`, 19 → `Yesterday`, 17 → `Tuesday`, Oct 21 → `21 Oct`. `typingText` for 0–3 names. `activeTypers`: self dropped; an event 5001 ms old dropped; two events from one user → one name with the latest `name`. `shouldSendTyping(null, 0)` true, `(1000, 3999)` false, `(1000, 4000)` true. `groupReactions` counts and `mine`, null skipped, order fixed. `quoteFor` for a live parent, a deleted parent, undefined.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run src/lib/chat && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Chat helpers: seen ticks, day labels, typing state, reactions and quotes"` (add new files first).

### Controller step (between Task 3 and Task 4): apply 0016 to hosted

After Task 1's review is clean, apply `0016_chat_features.sql` to the hosted project (owner approved). Then check with the service role: `rpc('unread_counts', { p_user: <Caleb demo id> })` succeeds; inserting a reaction `'🔥'` is rejected; every demo member has a `room_reads` row. Record the result in the ledger.

### Task 4: Room API (actions + richer GET)

**Files:** Create `src/app/api/rooms/[roomId]/chat-actions.ts`; modify `src/app/api/rooms/[roomId]/route.ts`, `src/app/api/state/route.ts` (select `deleted_at` in the last-message query).

**Interfaces:**
- Consumes: Task 1 functions, Tasks 2–3 helpers.
- Produces: `handleChatAction(admin, roomId: string, userId: string, body: Record<string, unknown>): Promise<NextResponse | null>` (null for actions it doesn't own). `edit_message {messageId, content}` → `{ message }` (fetch, `checkEdit`, trim/empty rule as send, then `update … .eq('id').eq('room_id').eq('sender_id', userId).eq('message_type','text').is('deleted_at', null)` with `.select()`; 0 rows → 409 `message_deleted`). `delete_message {messageId}` → `rpc('delete_chat_message')` → `rpcResult`, `{ ok: true }`. `react {messageId, emoji}` → `isReaction` else 400 `invalid_emoji`; `rpc('react_to_message')` → `rpcResult`. `mark_read {}` → `rpc('mark_room_read')`, `{ ok: true }`. The `message` action takes optional `replyToId` (fetch parent by id + room, `checkReplyTarget`, store `reply_to_id`).
- GET adds, per message, `reply_to` (parents not in the loaded 200 are fetched by id with `.eq('room_id', roomId)` **before** building the profile id list, so their senders get names) via `quoteFor`, and `reactions` via `groupReactions` (one `message_reactions` query for the loaded ids); room-level `reads: MemberRead[]` for the other members (`joined_at` from `pod_members.joined_at` or `duo_matches.created_at`; `last_read_at` from `room_reads` or null).
- [ ] **Step 1: Implement** `chat-actions.ts` and wire it into `route.ts` right after the membership check; add `replyToId`; add the GET fields without changing existing ones.
- [ ] **Step 2: Verify against hosted** with demo accounts Caleb and Hannah (Kingdom AI pod) through the local dev server (`fetch` from a signed-in page): send, reply, edit within the window, react 🙏 then ❤️ then ❤️ (ends with none), delete a prayer request and confirm its pin is gone from GET `pins`; as Hannah, edit and delete Caleb's message → 403; Hannah sends a message, Caleb's `unread_counts` shows 1 for that room and 0 after `mark_read`.
- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run` → PASS.
- [ ] **Step 4: Commit** `git commit -m "Room API: reply, edit, delete, react, mark read; GET returns quotes, reactions, reads"` (add `chat-actions.ts` first).

### Task 5: Room page UI

**Files:** Create `src/components/chat/MessageItem.tsx`, `src/components/chat/MessageMenu.tsx`, `src/lib/chat/useTyping.ts`; modify `src/app/rooms/[roomId]/page.tsx`, `src/app/globals.css`.

**Interfaces:**
- Consumes Tasks 2–4. `useTyping(roomId: string, me: { id: string; name: string }): { typingNames: string[]; notifyTyping: () => void }` — private channel `room:${roomId}` (`config: { private: true, broadcast: { self: false } }`, subscribe after `supabase.realtime.setAuth(token)` like the existing channel), event `typing` payload `{ user_id, name }`; uses `activeTypers` / `shouldSendTyping` and a 1 s tick to expire names.
- [ ] **Step 1: Extract** `renderMessage` into `MessageItem` with no behaviour change; the room renders as before.
- [ ] **Step 2: Render** each message with `id="msg-<id>"`; reply quote as a `<button>` that scrolls the original into view (`behavior: 'smooth'` unless reduced motion) and briefly highlights it, or plain text "Deleted message" when `reply_to.deleted`, or nothing when the parent is missing from the list and `reply_to` is null; `edited` label by the time; deleted text; reaction pills (`<button aria-pressed={mine} aria-label="React {emoji}, {count}">`); ticks on own messages (`✓` sr "Sent", `✓✓` sr "Seen" via `isSeen(created_at, reads)`); date separators as a plain `<li className="day-sep">` with the `dayLabel` text and decorative `aria-hidden` lines.
- [ ] **Step 3: `MessageMenu`** opened by a "More actions" button on each non-deleted message (visible on hover/focus, always on touch), long-press 450 ms, or the context-menu key; `role="menu"`, arrow keys, Escape closes and returns focus. Items: reaction bar, Reply, Copy, Edit (own text within `EDIT_WINDOW_MS`), Delete (own). Delete opens a native `<dialog>` confirm (pattern from `CreatePodDialog`) with the exact copy.
- [ ] **Step 4: Composer**: reply and edit bars above the input with ✕ and Escape; edit pre-fills and sends `edit_message`; reply sends `replyToId`. Typing line from `typingText(typingNames)`; `notifyTyping()` on input.
- [ ] **Step 5: Live + read state**: subscribe to `message_reactions` and `room_reads` with `filter: room_id=eq.${roomId}` next to the existing listeners (`fetchRoomData(true)`). Send `mark_read` immediately on first load when `document.visibilityState === 'visible'` and on `visibilitychange` to visible; after refetches that bring a newer message, send it with a 1 s leading-edge throttle.
- [ ] **Step 6: Browser check** (local dev server, hosted data): Caleb and Hannah in two isolated contexts; reply (and tap the quote), edit, delete with confirm, react, ticks turn ✓✓ after the other opens the chat, typing line, date separators; 390 px and 1440 px, light and dark; keyboard-only pass through the menu.
- [ ] **Step 7:** `npx tsc --noEmit && npx vitest run && npx eslint src/app/rooms src/components/chat src/lib/chat` → clean.
- [ ] **Step 8: Commit** (add new files) `git commit -m "Room page: message actions, reactions, quotes, ticks, typing, date separators"`

### Task 6: Unread badges and deleted previews

**Files:** Modify `src/app/api/state/route.ts`, `src/lib/useAppState.ts`, `src/lib/home-tabs.ts`, `src/lib/home-tabs.test.ts`, `src/app/page.tsx`, `src/app/globals.css`.

**Interfaces:** `/api/state` adds `unread: Record<string, number>` from `admin.rpc('unread_counts', { p_user: userId })` (left out on failure; the hook keeps the previous value). `RecentChat` gains `unread: number`; `recentChats(duoChats, pods, lastMessages, meId, unread: Record<string, number> = {})`; a last message with `deleted_at` previews as "This message was deleted" (with "You: " when mine).
- [ ] **Step 1: Failing tests** in `home-tabs.test.ts`: unread copied per room, default 0; deleted last message preview.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4: UI**: count pill on rows with `unread > 0` (sr "{n} unread"), bold name and preview, total on the Chats tab button (sr text in its label). **Step 5:** `npx tsc --noEmit && npx vitest run` → PASS; browser: open a chat, return, its badge is gone.
- [ ] **Step 6: Commit** `git commit -am "Unread badges and deleted-message previews on Home and Chats"`

### Task 7: Ship (owner-gated)

- [ ] **Step 1:** `npm run cf-build` succeeds; full test suite passes.
- [ ] **Step 2:** Ask the owner to approve merge to main, push and deploy. On approval: merge, `git push`, `npm run deploy`, smoke-test the live site, restart the dev server (the build overwrites `.next`).

# WhatsApp-style chat: design

Date: 2026-11-20. Owner picks recorded below; "builder's call" marks choices the owner did not make.

## Why

Unite by Faith is moving from "a prototype people try" to "an app people live in". Its first real users arrived from a Reddit testimony post (2026-11-14). People already know how chat works from WhatsApp; anything missing (fix a typo, take back a message, reply to one line in a busy group, know whether a friend saw your prayer request) feels broken. The goal is that chatting here feels as normal as WhatsApp, inside the faith-first, friendship-only spirit of the app.

## Goals (owner picked all of these)

Message actions:
1. **Reply (quote)**: reply to one message; the reply shows a small quote (sender name + first line) that jumps to the original when tapped.
2. **Edit own message**: change your own text within **15 minutes** of sending; shows an "edited" label.
3. **Delete**: delete your own message **at any time**, for everyone; others see "This message was deleted".
4. **Reactions**: one reaction per person per message from 🙏 ❤️ 👍 😂 🙌; counts show under the message; tapping your current reaction removes it.

Status:
5. **Unread badges**: a count on Home → Recent Messages and the Chats tab until you open the chat.
6. **Read ticks**: on your own messages, ✓ sent, ✓✓ seen. In a group, ✓✓ means everyone else in the room has seen it.
7. **Typing indicator**: "Hannah is typing…" (group: "Hannah and Daniel are typing…") while someone writes. Nothing is stored.
8. **Date separators**: "Today", "Yesterday", weekday within the week, else "12 Nov" between days in the message list.

## Non-goals

- Photos, voice notes, files, links previews, forwarding, starring, message search, pinning messages (the room already has a Prayer & Goals board), "delete for me only", per-message "seen by" lists, online/last-seen status, push notifications.
- Redesigning the room page layout (separate later work). New UI must fit the current room page.

## Anti-goals (would make it a failure even if it works)

- A deleted message's text still readable anywhere: database row, API response, Realtime payload or the browser. Members can read `chat_messages` directly with their own session (RLS policy `chat_messages_select_member`), so the text must be wiped in the row itself.
- Someone editing or deleting another person's message, or reacting/replying in a room they are not a member of.
- Edit history kept anywhere (WhatsApp shows none; less stored is better for privacy).
- Typing events or read times visible to people outside the room.
- Feeling like a dating app: no "last seen", no online dots.

## Constraints

- Stack: Next.js 16 (App Router) + React 19 + Supabase (Postgres, RLS, Realtime) on Cloudflare Workers. Writes go through `/api/rooms/[roomId]` (POST with `action`) using the service-role client after `requireUserId()` and `isRoomMember()` checks; the browser never writes tables directly.
- Database changes are a new migration `supabase/migrations/0016_chat_features.sql`. Applying it to the hosted project needs explicit owner approval (owner rule), as does deploying.
- The room page refetches the whole room (`fetchRoomData(true)`) on every Realtime `postgres_changes` event for `chat_messages` and `room_pins`; GET returns the latest 200 messages. New tables that should update the screen live must be added to the `supabase_realtime` publication and subscribed the same way.
- Accessibility: every action reachable by keyboard and screen reader (not only long-press); visible focus; destructive delete is confirmed.
- Existing special messages (prayer request, conversation starter, goal) keep working; the pinned board is unchanged.

## Approaches considered

1. **Columns + two small tables, server-enforced (chosen, builder's call).** `chat_messages` gains `reply_to_id`, `edited_at`, `deleted_at`; new `message_reactions` and `room_reads` tables; typing via Supabase Realtime broadcast on a private channel. All rules (15-minute edit, own-only, member-only, emoji list, wipe on delete) enforced in the API route and, where cheap, by DB constraints. Fits the existing write-through-API pattern and RLS model.
2. Store everything in `chat_messages.metadata` jsonb (reactions map, edited flag). No new tables, but concurrent reactions race (read-modify-write on one jsonb), unread counts can't be queried efficiently, and RLS can't protect parts of a row. Rejected.
3. Event log (every edit/delete/reaction as a new message row the client folds). Natural for Realtime, but complex to render, keeps edit history (anti-goal) and bloats the 200-message window. Rejected.

## The how (decided)

### Data (migration 0016)
- `chat_messages`: add `reply_to_id uuid null references chat_messages(id) on delete set null`, `edited_at timestamptz null`, `deleted_at timestamptz null`.
- `message_reactions(message_id uuid references chat_messages(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, emoji text null check (emoji is null or emoji in ('🙏','❤️','👍','😂','🙌')), created_at timestamptz default now(), primary key (message_id, user_id))`. RLS: select for members of the message's room; no direct writes. Add to `supabase_realtime`. Needs `room_id` (denormalised) so the Realtime filter `room_id=eq.<id>` works — builder's call: add `room_id uuid not null` set by the API.
- `room_reads(room_id uuid references chat_rooms(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, last_read_at timestamptz not null, primary key (room_id, user_id))`. RLS: select for members of the room; no direct writes. Add to `supabase_realtime` (ticks update live).
- `unread_counts(p_user uuid)` SQL function (service role only) returning `(room_id, unread int)`: messages in the user's rooms with `created_at > coalesce(last_read_at, '-infinity')`, `sender_id <> p_user`, `deleted_at is null`. One call from `/api/state` (no per-room queries).
- Realtime Authorization for typing: private broadcast channel topic `room:<roomId>`; RLS policies on `realtime.messages` allowing `select`/`insert` for `authenticated` only when `public.is_room_member(<room id parsed from realtime.topic()>)`.

### API (`POST /api/rooms/[roomId]`, new actions)
- `message` gains optional `replyToId` (must be a message in this room; otherwise 400).
- `edit_message {messageId, content}`: sender only, `message_type = 'text'`, not deleted, `now() - created_at <= 15 min`, same length/trim rules as sending; sets `content`, `edited_at = now()`. Else 403/409 with a clear error.
- `delete_message {messageId}`: sender only, any age, any message type; sets `deleted_at = now()`, `content = ''`, `metadata = '{}'`, and deletes its reactions. **Owner pick:** deleting a prayer request or goal message also deletes its pin (`room_pins` row named by the message's `metadata.pin_id`, when it belongs to the same sender and room), so the text is gone everywhere. Replies to it keep pointing at it and their quote shows "Deleted message".
- `react {messageId, emoji | null}`: member only, message in room and not deleted; upsert or remove the viewer's reaction.
- `mark_read {}`: upsert `room_reads.last_read_at = now()` for the viewer.
- GET returns per message: `reply_to` (`{id, sender_name, snippet, deleted}` resolved server-side even when the parent is outside the 200-message window), `edited_at`, `deleted_at`, `reactions` (`{emoji, count, mine}`), and for the room: `reads` (`{user_id, last_read_at}` for the other members).
- `/api/state` adds `unread: Record<roomId, number>` from `unread_counts`.

### UI (room page)
- Each message gets an actions menu: hover/focus "⋯" button on desktop, long-press (~450 ms) or the same button on touch. Menu: reaction bar (5 emojis), Reply, Copy, Edit (own text message within 15 min), Delete (own). Escape closes; focus returns to the trigger.
- Delete asks "Delete this message for everyone?" with Delete (danger) / Cancel.
- Reply: a bar above the composer ("Replying to Hannah: …" + ✕). Edit: composer prefilled, bar "Editing message" + ✕, button label "Save".
- Message bubble: quote block on top for replies; "edited" next to the time; deleted messages render "This message was deleted" in italic, no actions except none; reactions as small pills under the bubble (emoji + count, highlighted when mine; tap toggles).
- Ticks on own messages after the time: ✓ (sent) and ✓✓ (seen by all other members), with text alternatives ("Sent", "Seen").
- Typing line above the composer; sending a typing event at most every 3 s while typing; hide others' typing after 5 s of silence.
- Date separators between days (same rules as the chat list's relative time).
- Mark read: on open, when new messages arrive while the tab is visible, and when the tab becomes visible again (debounced ~1 s).

### UI (home)
- Unread count badge on Recent Messages and Chats rows; bold name/preview when unread; a total badge on the Chats tab button.

## Calls made after the builder check (builder's call; owner can reverse)

- **Seen in a group**: a message is ✓✓ when every *current* member other than the sender who was already a member when it was sent has `last_read_at >= created_at`. Members who joined later are not waited on; people who left are ignored. A room with no other qualifying member shows ✓ only.
- **Day one unread counts**: the migration backfills `room_reads.last_read_at = now()` for every current member of every room, so existing history does not all show as unread. A member with no row (joins later) counts messages from when they joined (pod `joined_at` / duo match `created_at`).
- **Realtime**: Supabase can't filter `DELETE` events by column, so reactions are never hard-deleted by the toggle: removing a reaction sets `emoji = null` (column nullable; check allows null or the 5 emojis), and the room subscribes to `message_reactions` and `room_reads` with `room_id=eq.<id>`. Edits and deletes of messages are `UPDATE`s on `chat_messages`, already covered by the existing `event: '*'` subscription. Refetch-on-event stays (rooms hold at most 4 people).
- **What counts as read**: the chat is open and the browser tab is visible. Scroll position is not tracked.
- **Replies**: replying to a deleted message is blocked (400); replying to special messages (prayer, starter, goal) is allowed.
- **Vanished parent**: if a reply's parent row is gone (`reply_to_id` set null when the sender's profile is deleted), the quote is simply not shown.
- **Rollout**: migration 0016 is applied first (after owner approval; old clients ignore the new columns), then the app is deployed (after owner approval).

## Left to the builder

- Exact component split, styling within the existing design tokens, menu positioning, animation (respect reduced motion).
- Whether to keep refetch-on-every-event or patch state from Realtime payloads (refetch is acceptable for this version).
- Test coverage beyond: API rules (edit window, own-only, member-only, emoji list, delete wipes content), unread/tick computation, date separators.

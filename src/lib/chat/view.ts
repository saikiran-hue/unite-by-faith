import type { ChatMessage, MemberRead, ReactionCount, ReactionEmoji, ReplyQuote } from '@/types/database';
import { EDIT_WINDOW_MS } from './rules';
import { dayKey, dayLabel } from './status';

export type MenuAction = 'reply' | 'copy' | 'edit' | 'delete';

/** What the message menu offers: nothing on a deleted message; edit only on my own text within the window. */
export function messageActions(
  m: Pick<ChatMessage, 'sender_id' | 'message_type' | 'created_at' | 'deleted_at'>,
  meId: string,
  now: number
): MenuAction[] {
  if (m.deleted_at) return [];
  const mine = m.sender_id === meId;
  const actions: MenuAction[] = ['reply', 'copy'];
  // `<=` is false for NaN, so an unreadable timestamp never offers edit.
  if (mine && m.message_type === 'text' && now - Date.parse(m.created_at) <= EDIT_WINDOW_MS) {
    actions.push('edit');
  }
  if (mine) actions.push('delete');
  return actions;
}

/** Tapping my current reaction removes it (null); any other emoji replaces it. */
export function reactionToSend(
  reactions: ReactionCount[] | undefined,
  emoji: ReactionEmoji
): ReactionEmoji | null {
  return (reactions ?? []).some((r) => r.emoji === emoji && r.mine) ? null : emoji;
}

export type DayRow<T> = { kind: 'day'; key: string; label: string } | { kind: 'item'; item: T };

/**
 * Items in order with a day separator before each new local day. Days never go backwards: an item
 * older than one above it (a failed send from an earlier day below newer messages, a client clock
 * behind the server's) stays under the current separator, so labels read in order and each day's
 * key appears once.
 */
export function withDaySeparators<T>(items: T[], isoOf: (item: T) => string, now: Date): DayRow<T>[] {
  const rows: DayRow<T>[] = [];
  let last = '';
  let latest = '';
  for (const item of items) {
    const own = isoOf(item);
    const iso = latest && Date.parse(own) < Date.parse(latest) ? latest : own;
    latest = iso;
    const key = dayKey(iso);
    if (key !== last) {
      rows.push({ kind: 'day', key: `day-${key}`, label: dayLabel(iso, now) });
      last = key;
    }
    rows.push({ kind: 'item', item });
  }
  return rows;
}

/** Id of the newest message someone else sent (list is oldest first), or null. */
export function newestFromOthers(messages: { id: string; sender_id: string }[], meId: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_id !== meId) return messages[i].id;
  }
  return null;
}

export interface MarkReadState {
  visible: boolean;
  mounted: boolean;
  /** Newest message from someone else on screen: undefined before the first load, null when none. */
  newest: string | null | undefined;
  /** The newest one the server confirmed as read; undefined until the first confirmed mark. */
  marked: string | null | undefined;
  /** The one a mark_read request is out for now; undefined when none is. */
  sending: string | null | undefined;
}

/**
 * Whether to send mark_read now. Only for what this screen has loaded and shown, only while the
 * page is visible and mounted, and not again for a mark already confirmed or on its way.
 */
export function shouldMarkRead(s: MarkReadState): boolean {
  if (!s.visible || !s.mounted || s.newest === undefined) return false;
  return s.newest !== s.marked && s.newest !== s.sending;
}

type ReadRow = { user_id?: unknown; last_read_at?: unknown };

const laterOf = (a: string | null, b: string | null) =>
  a === null ? b : b === null ? a : Date.parse(b) > Date.parse(a) ? b : a;

/** Another member's read mark from Realtime, patched in. Rows for anyone not listed (me included) change nothing. */
export function applyReadMark(reads: MemberRead[], row: ReadRow | undefined): MemberRead[] {
  const userId = row?.user_id;
  const at = row?.last_read_at;
  if (typeof userId !== 'string' || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return reads;
  const i = reads.findIndex((r) => r.user_id === userId);
  if (i < 0) return reads;
  const next = laterOf(reads[i].last_read_at, at);
  if (next === reads[i].last_read_at) return reads;
  return reads.map((r, j) => (j === i ? { ...r, last_read_at: next } : r));
}

/** Loaded read state, keeping any later mark already patched in: a slow load must not undo it. */
export function mergeReads(fetched: MemberRead[], current: MemberRead[]): MemberRead[] {
  const now = new Map(current.map((r) => [r.user_id, r.last_read_at]));
  return fetched.map((r) => {
    if (!now.has(r.user_id)) return r;
    const next = laterOf(r.last_read_at, now.get(r.user_id) ?? null);
    return next === r.last_read_at ? r : { ...r, last_read_at: next };
  });
}

/** Other people with a message that was not in the previous load (none on the first load). */
export function newSenders(
  prevIds: ReadonlySet<string> | null,
  messages: { id: string; sender_id: string }[],
  meId: string | undefined
): string[] {
  if (!prevIds) return [];
  const out = new Set<string>();
  for (const m of messages) {
    if (!prevIds.has(m.id) && m.sender_id !== meId) out.add(m.sender_id);
  }
  return [...out];
}

const ERROR_COPY = new Map<string, string>([
  ['message_deleted', 'This message was deleted.'],
  ['message_not_found', 'That message is no longer in this chat.'],
  ['edit_window_passed', 'Messages can only be edited for 15 minutes.'],
  ['only_text_editable', 'Only text messages can be edited.'],
  ['not_your_message', 'You can only change your own messages.'],
  ['not_a_member', 'You’re no longer a member of this chat.'],
  ['pin_not_found', 'That pin is no longer on the board.'],
]);

/** What a room POST came back with; status 0 when no answer came. */
export type PostResult = { ok: boolean; status: number; error?: string };

/** The server says the message is deleted or gone: the screen is behind, so reload it. */
export function isGone(r: Pick<PostResult, 'error'>): boolean {
  return r.error === 'message_deleted' || r.error === 'message_not_found';
}

/**
 * Copy for a room action that failed: what happened when the server said so, the caller's
 * connection hint when no answer came or the server failed (5xx).
 */
export function errorCopy(r: Pick<PostResult, 'status' | 'error'>, connection: string): string {
  const known = r.error === undefined ? undefined : ERROR_COPY.get(r.error);
  if (known) return known;
  if (r.status === 0 || r.status >= 500) return connection;
  if (r.status === 403) return ERROR_COPY.get('not_your_message')!;
  return 'That didn’t go through. Refresh the chat, then try again.';
}

/** Runs fn at once, then at most once more when the window ends if it was called again meanwhile. */
export function leadingThrottle(fn: () => void, ms: number) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    last = Date.now();
    fn();
  };
  return {
    call() {
      const wait = last + ms - Date.now();
      if (wait <= 0) {
        run();
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          run();
        }, wait);
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export interface PendingReply {
  replyToId?: string;
  /** The quote as it was when the reply was written. */
  quote?: ReplyQuote;
  /** The server refused the parent (400 reply_target_invalid). */
  replyGone?: boolean;
}

/**
 * A sending or failed reply, judged against the loaded messages. A deleted (or server-refused)
 * parent shows as "Deleted message" with no text and is not sent again, so Retry can succeed.
 * A parent outside the loaded list is kept: the server decides.
 */
export function resolvePendingReply(
  p: PendingReply,
  messages: Pick<ChatMessage, 'id' | 'deleted_at'>[]
): { replyToId?: string; quote?: ReplyQuote } {
  if (!p.replyToId || !p.quote) return { replyToId: p.replyToId, quote: p.quote };
  const parent = messages.find((m) => m.id === p.replyToId);
  if (p.replyGone || parent?.deleted_at) {
    return { replyToId: undefined, quote: { ...p.quote, snippet: '', deleted: true } };
  }
  return { replyToId: p.replyToId, quote: p.quote };
}

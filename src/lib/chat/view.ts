import type { ChatMessage, ReactionCount, ReactionEmoji, ReplyQuote } from '@/types/database';
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

/** Items in order with a day separator before each new local day. */
export function withDaySeparators<T>(items: T[], isoOf: (item: T) => string, now: Date): DayRow<T>[] {
  const rows: DayRow<T>[] = [];
  let last = '';
  for (const item of items) {
    const iso = isoOf(item);
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

import type { ChatMessage, ReactionCount, ReactionEmoji } from '@/types/database';
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

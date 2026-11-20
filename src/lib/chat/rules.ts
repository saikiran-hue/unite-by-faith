import type { ChatMessage, ReactionEmoji } from '@/types/database';

export const EDIT_WINDOW_MS = 900_000;

export const REACTIONS: readonly ReactionEmoji[] = ['🙏', '❤️', '👍', '😂', '🙌'];

export type RuleMsg = Pick<
  ChatMessage,
  'id' | 'room_id' | 'sender_id' | 'message_type' | 'created_at' | 'deleted_at'
>;

export type Check =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const fail = (status: 400 | 403 | 404 | 409, error: string): Check => ({
  ok: false,
  status,
  error,
});

export function checkEdit(
  msg: RuleMsg | null,
  userId: string,
  roomId: string,
  now: Date
): Check {
  if (!msg || msg.room_id !== roomId) return fail(404, 'message_not_found');
  if (msg.sender_id !== userId) return fail(403, 'not_your_message');
  if (msg.deleted_at) return fail(409, 'message_deleted');
  if (msg.message_type !== 'text') return fail(409, 'only_text_editable');
  // Written so an unreadable created_at (NaN) refuses. A slightly negative gap (database clock a
  // little ahead of the Worker's) is a just-sent message and stays editable.
  const elapsed = now.getTime() - Date.parse(msg.created_at);
  if (!(elapsed <= EDIT_WINDOW_MS)) return fail(409, 'edit_window_passed');
  return { ok: true };
}

export function checkReplyTarget(parent: RuleMsg | null, roomId: string): Check {
  if (!parent || parent.room_id !== roomId || parent.deleted_at) {
    return fail(400, 'reply_target_invalid');
  }
  return { ok: true };
}

export function isReaction(v: unknown): v is ReactionEmoji | null {
  return v === null || (typeof v === 'string' && (REACTIONS as readonly string[]).includes(v));
}

export function rpcResult(code: string): Check {
  switch (code) {
    case 'ok':
      return { ok: true };
    case 'message_not_found':
      return fail(404, code);
    case 'not_your_message':
      return fail(403, code);
    case 'message_deleted':
      return fail(409, code);
    case 'invalid_emoji':
      return fail(400, code);
    default:
      return fail(409, code);
  }
}

// Grapheme clusters keep ❤️ (two code points) and ZWJ sequences whole; code points where
// Intl.Segmenter is missing.
const graphemes =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** One line of at most `max` characters (grapheme clusters, so an emoji is never split) plus "…". */
export function snippet(content: string, max = 80): string {
  const line = content.replace(/\s+/g, ' ').trim();
  const chars = graphemes ? Array.from(graphemes.segment(line), (g) => g.segment) : Array.from(line);
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : chars.join('');
}

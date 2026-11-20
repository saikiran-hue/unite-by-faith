import type { ReactionCount, ReplyQuote } from '@/types/database';
import { REACTIONS, snippet } from './rules';

export type ReactionRow = { message_id: string; user_id: string; emoji: string | null };

/** Reaction pills for one message, in fixed REACTIONS order, zero counts omitted. */
export function groupReactions(rows: ReactionRow[], messageId: string, meId: string): ReactionCount[] {
  const out: ReactionCount[] = [];
  for (const emoji of REACTIONS) {
    const mine = rows.filter((r) => r.message_id === messageId && r.emoji === emoji);
    if (mine.length > 0) {
      out.push({ emoji, count: mine.length, mine: mine.some((r) => r.user_id === meId) });
    }
  }
  return out;
}

export function quoteFor(
  parent: { id: string; sender_id: string; content: string; deleted_at: string | null } | undefined,
  nameOf: (id: string) => string
): ReplyQuote | null {
  if (!parent) return null;
  const deleted = parent.deleted_at !== null;
  return {
    id: parent.id,
    sender_name: nameOf(parent.sender_id).trim().split(/\s+/)[0] ?? '',
    snippet: deleted ? '' : snippet(parent.content),
    deleted,
  };
}

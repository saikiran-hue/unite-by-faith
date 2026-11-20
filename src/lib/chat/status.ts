import type { MemberRead } from '@/types/database';
import { daysAgo } from '@/lib/home-tabs';

export const TYPING_SEND_MS = 3000;
export const TYPING_TTL_MS = 5000;

export type TypingEvent = { user_id: string; name: string; at: number };

/** True when someone else is in the room for this message and every such member has read it. */
export function isSeen(createdAt: string, others: MemberRead[]): boolean {
  const created = Date.parse(createdAt);
  const qualifying = others.filter((m) => Date.parse(m.joined_at) <= created);
  if (qualifying.length === 0) return false;
  return qualifying.every((m) => m.last_read_at !== null && Date.parse(m.last_read_at) >= created);
}

/** Date-separator label: "Today", "Yesterday", a weekday within the week, else "12 Nov". */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = daysAgo(d, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function typingText(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

/**
 * Who a typing event is from, as the room knows them: the participant's own name for that user id.
 * The payload's name is never used, and an id that is not in the room gives null (drop the event).
 */
export function typerName(userId: unknown, participants: ReadonlyMap<string, string>): string | null {
  if (typeof userId !== 'string') return null;
  return participants.get(userId) || null;
}

/** Names of other people typing now: one per user (latest event's name), first-seen order. */
export function activeTypers(events: TypingEvent[], meId: string, now: number): string[] {
  const latest = new Map<string, TypingEvent>();
  for (const e of events) {
    const prev = latest.get(e.user_id);
    if (!prev || e.at >= prev.at) latest.set(e.user_id, e);
  }
  const names: string[] = [];
  for (const [userId, e] of latest) {
    if (userId === meId || now - e.at > TYPING_TTL_MS) continue;
    names.push(e.name);
  }
  return names;
}

export function shouldSendTyping(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING_SEND_MS;
}

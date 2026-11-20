import type { DuoChat, FellowshipPod, LastMessage } from '@/types/database';

export const TABS = ['home', 'matches', 'chats', 'habits', 'profile'] as const;
export type Tab = (typeof TABS)[number];

/** The tab named in the URL, or Home for anything else. */
export function parseTab(value: string | null | undefined): Tab {
  return (TABS as readonly string[]).includes(value ?? '') ? (value as Tab) : 'home';
}

/** Match results shown per page; Show More reveals the next page. */
export const MATCH_PAGE = 20;

/** Opening Match starts one 1v1 search: no results yet, at least 3 habits, signed in, not already started. */
export function shouldAutoSearch(s: {
  tab: Tab;
  hasSearch: boolean;
  tooFew: boolean;
  signedIn: boolean;
  alreadyFired: boolean;
}): boolean {
  return s.tab === 'matches' && !s.hasSearch && !s.tooFew && s.signedIn && !s.alreadyFired;
}

/** The first `shown` items, and how many are still hidden. */
export function pageOf<T>(items: T[], shown: number): { visible: T[]; remaining: number } {
  const visible = items.slice(0, shown);
  return { visible, remaining: items.length - visible.length };
}

export interface RecentChat {
  roomId: string;
  kind: 'duo' | 'pod';
  name: string;
  /** Partner photo for a 1v1, null for a group (the caller draws the cover). */
  avatar: string | null;
  pod: FellowshipPod | null;
  preview: string | null;
  at: string | null;
  /** Messages from others since the viewer last read the room. */
  unread: number;
}

/** Message text without the leading emoji and "Shared Prayer Request:" wrapper the server adds. */
export function cleanText(content: string): string {
  return content
    .replace(/^\p{Extended_Pictographic}️?\s*/u, '')
    .replace(/^Shared (?:Prayer Request|Fellowship Goal): "(.*?)"/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function previewOf(m: LastMessage | undefined, meId: string): string | null {
  if (!m) return null;
  if (m.deleted_at) return `${m.sender_id === meId ? 'You: ' : ''}This message was deleted`;
  const text = cleanText(m.content);
  const label =
    m.message_type === 'prayer_request'
      ? 'Prayer Request: '
      : m.message_type === 'icebreaker'
        ? 'Conversation Starter: '
        : m.message_type === 'milestone'
          ? 'Goal: '
          : '';
  return `${m.sender_id === meId ? 'You: ' : ''}${label}${text}`;
}

/** 1v1 and group chats in one list, newest message first; chats with no messages go last, by name. */
export function recentChats(
  duoChats: DuoChat[],
  pods: FellowshipPod[],
  lastMessages: Record<string, LastMessage>,
  meId: string,
  unread: Record<string, number> = {}
): RecentChat[] {
  const all: RecentChat[] = [
    ...duoChats.map((d) => ({
      roomId: d.chat_room_id,
      kind: 'duo' as const,
      name: d.partner.full_name,
      avatar: d.partner.avatar_url,
      pod: null,
      preview: previewOf(lastMessages[d.chat_room_id], meId),
      at: lastMessages[d.chat_room_id]?.created_at ?? null,
      unread: unread[d.chat_room_id] ?? 0,
    })),
    ...pods.map((p) => ({
      roomId: p.chat_room_id,
      kind: 'pod' as const,
      name: p.title,
      avatar: null,
      pod: p,
      preview: previewOf(lastMessages[p.chat_room_id], meId),
      at: lastMessages[p.chat_room_id]?.created_at ?? null,
      unread: unread[p.chat_room_id] ?? 0,
    })),
  ];
  return all.sort((a, b) => {
    if (a.at && b.at) return b.at.localeCompare(a.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Whole calendar days from `d` back to `now`, by local midnight (a future time counts as today). */
export function daysAgo(d: Date, now: Date): number {
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((midnight(now) - midnight(d)) / 86_400_000));
}

/** Chat-list time: "11:08 AM" today, "Yesterday", a weekday within the week, else "12 Nov". */
export function relTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = daysAgo(d, now);
  if (days === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

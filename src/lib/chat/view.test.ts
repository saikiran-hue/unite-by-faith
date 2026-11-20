import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDIT_WINDOW_MS } from './rules';
import {
  leadingThrottle,
  messageActions,
  newestFromOthers,
  newSenders,
  reactionToSend,
  resolvePendingReply,
  withDaySeparators,
} from './view';

const ME = 'me';
const created = '2026-11-20T10:00:00.000Z';
const at = (ms: number) => Date.parse(created) + ms;
const msg = (over: Partial<Parameters<typeof messageActions>[0]> = {}) => ({
  sender_id: ME,
  message_type: 'text' as const,
  created_at: created,
  deleted_at: null,
  ...over,
});

describe('messageActions', () => {
  it('offers everything on my own fresh text message', () => {
    expect(messageActions(msg(), ME, at(1000))).toEqual(['reply', 'copy', 'edit', 'delete']);
  });

  it('allows edit exactly at the window and not one ms past it', () => {
    expect(messageActions(msg(), ME, at(EDIT_WINDOW_MS))).toContain('edit');
    expect(messageActions(msg(), ME, at(EDIT_WINDOW_MS + 1))).toEqual(['reply', 'copy', 'delete']);
  });

  it('never offers edit on special messages, but still delete', () => {
    for (const t of ['prayer_request', 'icebreaker', 'milestone'] as const) {
      expect(messageActions(msg({ message_type: t }), ME, at(1000))).toEqual(['reply', 'copy', 'delete']);
    }
  });

  it('offers only reply and copy on someone else’s message', () => {
    expect(messageActions(msg({ sender_id: 'other' }), ME, at(1000))).toEqual(['reply', 'copy']);
  });

  it('offers nothing on a deleted message', () => {
    expect(messageActions(msg({ deleted_at: created }), ME, at(1000))).toEqual([]);
  });

  it('fails closed on an unreadable created_at', () => {
    expect(messageActions(msg({ created_at: 'nope' }), ME, at(1000))).not.toContain('edit');
  });
});

describe('reactionToSend', () => {
  it('sends the emoji when it is not already mine', () => {
    expect(reactionToSend([], '🙏')).toBe('🙏');
    expect(reactionToSend([{ emoji: '🙏', count: 2, mine: false }], '🙏')).toBe('🙏');
    expect(reactionToSend([{ emoji: '❤️', count: 1, mine: true }], '🙏')).toBe('🙏');
    expect(reactionToSend(undefined, '👍')).toBe('👍');
  });

  it('sends null to remove my current reaction', () => {
    expect(reactionToSend([{ emoji: '🙏', count: 3, mine: true }], '🙏')).toBeNull();
  });
});

describe('withDaySeparators', () => {
  // Local-time inputs so the day boundaries do not depend on the machine's time zone.
  const now = new Date(2026, 10, 20, 15, 0);
  const iso = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();

  it('puts one separator before each new local day, in order', () => {
    const items = [
      { id: 'a', at: iso(12, 9) },
      { id: 'b', at: iso(19, 23) },
      { id: 'c', at: iso(20, 0) },
      { id: 'd', at: iso(20, 14) },
    ];
    const rows = withDaySeparators(items, (i) => i.at, now);
    expect(rows.map((r) => (r.kind === 'day' ? `[${r.label}]` : r.item.id))).toEqual([
      '[12 Nov]',
      'a',
      '[Yesterday]',
      'b',
      '[Today]',
      'c',
      'd',
    ]);
  });

  it('gives separators stable, unique keys', () => {
    const rows = withDaySeparators([{ at: iso(19, 9) }, { at: iso(20, 9) }], (i) => i.at, now);
    const keys = rows.flatMap((r) => (r.kind === 'day' ? [r.key] : []));
    expect(keys).toEqual(['day-2026-11-19', 'day-2026-11-20']);
  });

  it('returns nothing for no items', () => {
    expect(withDaySeparators([], () => '', now)).toEqual([]);
  });
});

describe('newestFromOthers', () => {
  it('is the last message someone else sent', () => {
    const list = [
      { id: '1', sender_id: 'other' },
      { id: '2', sender_id: 'other2' },
      { id: '3', sender_id: ME },
    ];
    expect(newestFromOthers(list, ME)).toBe('2');
  });

  it('is null when only I have written', () => {
    expect(newestFromOthers([{ id: '1', sender_id: ME }], ME)).toBeNull();
    expect(newestFromOthers([], ME)).toBeNull();
  });
});

describe('leadingThrottle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at once, then once more at the end of a busy window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = leadingThrottle(fn, 1000);
    t.call();
    expect(fn).toHaveBeenCalledTimes(1);
    t.call();
    t.call();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs at once again after a quiet window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = leadingThrottle(fn, 1000);
    t.call();
    vi.advanceTimersByTime(1500);
    t.call();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('drops a waiting trailing call when cancelled', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = leadingThrottle(fn, 1000);
    t.call();
    t.call();
    t.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('resolvePendingReply', () => {
  const quote = { id: 'p1', sender_name: 'Hannah', snippet: 'Praying for you', deleted: false };
  const pend = { replyToId: 'p1', quote };
  const gone = { replyToId: undefined, quote: { ...quote, snippet: '', deleted: true } };

  it('keeps the quote and the reply while the parent is live', () => {
    expect(resolvePendingReply(pend, [{ id: 'p1', deleted_at: null }])).toEqual({ replyToId: 'p1', quote });
  });

  it('shows a deleted parent as gone, with no snippet, and stops sending the reply', () => {
    expect(resolvePendingReply(pend, [{ id: 'p1', deleted_at: '2026-11-20T10:00:00Z' }])).toEqual(gone);
  });

  it('treats a parent the server rejected as gone, even before the list shows it deleted', () => {
    expect(resolvePendingReply({ ...pend, replyGone: true }, [{ id: 'p1', deleted_at: null }])).toEqual(gone);
  });

  it('keeps the reply when the parent is not in the loaded list, so the server decides', () => {
    expect(resolvePendingReply(pend, [{ id: 'other', deleted_at: null }])).toEqual({ replyToId: 'p1', quote });
  });

  it('passes a message that is not a reply through unchanged', () => {
    expect(resolvePendingReply({}, [])).toEqual({ replyToId: undefined, quote: undefined });
  });
});

describe('newSenders', () => {
  const list = [
    { id: 'a', sender_id: 'u1' },
    { id: 'b', sender_id: ME },
    { id: 'c', sender_id: 'u2' },
    { id: 'd', sender_id: 'u2' },
  ];

  it('names other people with a message that was not loaded before', () => {
    expect(newSenders(new Set(['a', 'b']), list, ME)).toEqual(['u2']);
  });

  it('finds nobody on the first load, for my own messages, or when nothing is new', () => {
    expect(newSenders(null, list, ME)).toEqual([]);
    expect(newSenders(new Set(['a', 'c', 'd']), list, ME)).toEqual([]);
  });
});

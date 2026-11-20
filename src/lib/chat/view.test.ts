import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDIT_WINDOW_MS } from './rules';
import {
  applyReadMark,
  errorCopy,
  leadingThrottle,
  mergeReads,
  messageActions,
  newestFromOthers,
  newSenders,
  reactionToSend,
  resolvePendingReply,
  shouldMarkRead,
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

describe('shouldMarkRead', () => {
  const base = { visible: true, mounted: true, newest: 'm2', marked: 'm1', sending: undefined };

  it('marks a newer message from someone else while visible', () => {
    expect(shouldMarkRead(base)).toBe(true);
  });

  it('marks on the first load even when nobody else has written yet', () => {
    expect(shouldMarkRead({ ...base, newest: null, marked: undefined })).toBe(true);
  });

  it('never marks while hidden, after unmount, or before the first load', () => {
    expect(shouldMarkRead({ ...base, visible: false })).toBe(false);
    expect(shouldMarkRead({ ...base, mounted: false })).toBe(false);
    expect(shouldMarkRead({ ...base, newest: undefined, marked: undefined })).toBe(false);
  });

  it('does not repeat a confirmed mark or one already on its way', () => {
    expect(shouldMarkRead({ ...base, marked: 'm2' })).toBe(false);
    expect(shouldMarkRead({ ...base, sending: 'm2' })).toBe(false);
    expect(shouldMarkRead({ ...base, newest: null, marked: null })).toBe(false);
  });

  it('marks the newer message while an older mark is still out', () => {
    expect(shouldMarkRead({ ...base, newest: 'm3', sending: 'm2' })).toBe(true);
  });
});

describe('applyReadMark and mergeReads', () => {
  const t = (s: number) => new Date(Date.UTC(2026, 10, 20, 10, 0, s)).toISOString();
  const reads = [
    { user_id: 'u1', last_read_at: t(10), joined_at: t(0) },
    { user_id: 'u2', last_read_at: null, joined_at: t(0) },
  ];

  it('patches a member’s newer read mark in place', () => {
    expect(applyReadMark(reads, { user_id: 'u2', last_read_at: t(20) })).toEqual([
      reads[0],
      { ...reads[1], last_read_at: t(20) },
    ]);
  });

  it('accepts the Postgres timestamp format from Realtime', () => {
    const at = '2026-11-20T10:00:30.123456+00:00';
    expect(applyReadMark(reads, { user_id: 'u1', last_read_at: at })[0].last_read_at).toBe(at);
  });

  it('ignores me, unknown members, older marks and malformed rows', () => {
    expect(applyReadMark(reads, { user_id: 'me', last_read_at: t(30) })).toBe(reads);
    expect(applyReadMark(reads, { user_id: 'u1', last_read_at: t(5) })).toBe(reads);
    expect(applyReadMark(reads, { user_id: 'u1', last_read_at: 'soon' })).toBe(reads);
    expect(applyReadMark(reads, {})).toBe(reads);
    expect(applyReadMark(reads, undefined)).toBe(reads);
  });

  it('a slow load keeps a later mark patched in meanwhile, and takes newer loaded marks', () => {
    const patched = applyReadMark(reads, { user_id: 'u1', last_read_at: t(40) });
    const stale = [
      { ...reads[0], last_read_at: t(10) },
      { ...reads[1], last_read_at: t(50) },
    ];
    expect(mergeReads(stale, patched)).toEqual([
      { ...reads[0], last_read_at: t(40) },
      { ...reads[1], last_read_at: t(50) },
    ]);
  });

  it('the loaded list decides who is listed', () => {
    const fetched = [{ user_id: 'u3', last_read_at: null, joined_at: t(0) }];
    expect(mergeReads(fetched, reads)).toEqual(fetched);
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

describe('errorCopy', () => {
  const conn = 'Check your connection, then try again.';

  it('says what happened for known codes', () => {
    expect(errorCopy({ status: 409, error: 'message_deleted' }, conn)).toBe('This message was deleted.');
    expect(errorCopy({ status: 409, error: 'edit_window_passed' }, conn)).toBe(
      'Messages can only be edited for 15 minutes.'
    );
    expect(errorCopy({ status: 403, error: 'not_your_message' }, conn)).toBe(
      'You can only change your own messages.'
    );
    expect(errorCopy({ status: 403, error: 'not_a_member' }, conn)).toBe(
      'You’re no longer a member of this chat.'
    );
  });

  it('keeps the connection hint for no answer and server failures', () => {
    expect(errorCopy({ status: 0 }, conn)).toBe(conn);
    expect(errorCopy({ status: 500, error: 'boom' }, conn)).toBe(conn);
    expect(errorCopy({ status: 503 }, conn)).toBe(conn);
  });

  it('falls back by status for other refusals, and ignores inherited names', () => {
    expect(errorCopy({ status: 403 }, conn)).toBe('You can only change your own messages.');
    expect(errorCopy({ status: 400, error: 'constructor' }, conn)).toBe(
      'That didn’t go through. Refresh the chat, then try again.'
    );
  });

  it('uses plain sentences with no exclamation marks', () => {
    for (const r of [
      { status: 409, error: 'message_deleted' },
      { status: 404, error: 'message_not_found' },
      { status: 409, error: 'only_text_editable' },
      { status: 404, error: 'pin_not_found' },
      { status: 400 },
    ]) {
      expect(errorCopy(r, conn)).toMatch(/^[^!]+\.$/);
    }
  });
});

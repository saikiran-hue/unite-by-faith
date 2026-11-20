import { describe, expect, it } from 'vitest';
import type { ReactionCount, ReplyQuote } from '@/types/database';
import { groupReactions, quoteFor, type ReactionRow } from './hydrate';

describe('groupReactions', () => {
  it('groups reactions for the target message in REACTIONS order, tracks mine, and skips nulls and other messages', () => {
    const rows: ReactionRow[] = [
      { message_id: 'm1', user_id: 'u1', emoji: '🙌' },
      { message_id: 'm2', user_id: 'me', emoji: '😂' },
      { message_id: 'm1', user_id: 'u2', emoji: null },
      { message_id: 'm1', user_id: 'me', emoji: '🙏' },
      { message_id: 'm1', user_id: 'u3', emoji: '🙏' },
      { message_id: 'm1', user_id: 'u4', emoji: '❤️' },
    ];

    const expected: ReactionCount[] = [
      { emoji: '🙏', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
      { emoji: '🙌', count: 1, mine: false },
    ];

    expect(groupReactions(rows, 'm1', 'me')).toEqual(expected);
  });

  it('returns an empty array when the message has no valid reactions', () => {
    const rows: ReactionRow[] = [
      { message_id: 'm2', user_id: 'me', emoji: '🙏' },
      { message_id: 'm1', user_id: 'u1', emoji: null },
    ];

    expect(groupReactions(rows, 'm1', 'me')).toEqual([]);
    expect(groupReactions([], 'm1', 'me')).toEqual([]);
  });
});

describe('quoteFor', () => {
  const nameOf = () => 'Hannah Lee';

  it('builds a ReplyQuote with first name and flattened snippet for a live parent', () => {
    const expected: ReplyQuote = {
      id: 'p1',
      sender_name: 'Hannah',
      snippet: 'line one line two',
      deleted: false,
    };

    expect(
      quoteFor(
        { id: 'p1', sender_id: 'u2', content: 'line one\nline two', deleted_at: null },
        nameOf
      )
    ).toEqual(expected);
  });

  it('truncates long content to 80 characters plus ellipsis', () => {
    expect(
      quoteFor(
        { id: 'p1', sender_id: 'u2', content: 'x'.repeat(2000), deleted_at: null },
        nameOf
      )
    ).toEqual({
      id: 'p1',
      sender_name: 'Hannah',
      snippet: `${'x'.repeat(80)}…`,
      deleted: false,
    });
  });

  it('returns empty snippet and deleted true for a deleted parent', () => {
    expect(
      quoteFor(
        {
          id: 'p1',
          sender_id: 'u2',
          content: 'hidden content',
          deleted_at: '2026-11-20T10:05:00.000Z',
        },
        nameOf
      )
    ).toEqual({
      id: 'p1',
      sender_name: 'Hannah',
      snippet: '',
      deleted: true,
    });
  });

  it('returns null when parent is undefined', () => {
    expect(quoteFor(undefined, nameOf)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { MemberRead } from '@/types/database';
import {
  TYPING_SEND_MS,
  TYPING_TTL_MS,
  activeTypers,
  dayKey,
  dayLabel,
  isSeen,
  shouldSendTyping,
  typingText,
  type TypingEvent,
} from './status';

const createdAt = '2026-11-20T10:00:00.000Z';
const joinedBefore = '2026-11-01T00:00:00.000Z';
const joinedAfter = '2026-11-20T11:00:00.000Z';

describe('constants', () => {
  it('defines TYPING_SEND_MS as 3000 and TYPING_TTL_MS as 5000', () => {
    expect(TYPING_SEND_MS).toBe(3000);
    expect(TYPING_TTL_MS).toBe(5000);
  });
});

describe('isSeen', () => {
  it('returns false when there are no other members', () => {
    expect(isSeen(createdAt, [])).toBe(false);
  });

  it('returns false when only a later joiner is present', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: '2026-11-20T12:00:00.000Z', joined_at: joinedAfter },
    ];
    expect(isSeen(createdAt, others)).toBe(false);
  });

  it('returns false when a qualifying member has last_read_at null', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: null, joined_at: joinedBefore },
    ];
    expect(isSeen(createdAt, others)).toBe(false);
  });

  it('returns false when one of two qualifying members has not read up to createdAt', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: '2026-11-20T10:05:00.000Z', joined_at: joinedBefore },
      { user_id: 'u2', last_read_at: '2026-11-20T09:59:59.000Z', joined_at: joinedBefore },
    ];
    expect(isSeen(createdAt, others)).toBe(false);
  });

  it('returns true when all qualifying members have read at or after createdAt', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: '2026-11-20T10:00:00.000Z', joined_at: joinedBefore },
      { user_id: 'u2', last_read_at: '2026-11-20T10:05:00.000Z', joined_at: joinedBefore },
    ];
    expect(isSeen(createdAt, others)).toBe(true);
  });

  it('ignores members who joined after createdAt when qualifying members have read', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: '2026-11-20T10:01:00.000Z', joined_at: joinedBefore },
      { user_id: 'u2', last_read_at: null, joined_at: joinedAfter },
    ];
    expect(isSeen(createdAt, others)).toBe(true);
  });

  it('treats equivalent timezone offsets (+00:00) as equal to createdAt', () => {
    const others: MemberRead[] = [
      { user_id: 'u1', last_read_at: '2026-11-20T10:00:00+00:00', joined_at: joinedBefore },
    ];
    expect(isSeen(createdAt, others)).toBe(true);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 20, 15);

  it('returns Today, Yesterday, weekday for 2-6 days ago, and d MMM for older dates', () => {
    expect(dayLabel(new Date(2026, 10, 20, 12).toISOString(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 19, 12).toISOString(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 17, 12).toISOString(), now)).toBe('Tuesday');
    expect(dayLabel(new Date(2026, 9, 21, 12).toISOString(), now)).toBe('21 Oct');
  });
});

describe('dayKey', () => {
  it('returns local YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 10, 5, 23, 30).toISOString())).toBe('2026-11-05');
  });
});

describe('typingText', () => {
  it('formats 0, 1, 2, and 3+ typers with exact copy', () => {
    expect(typingText([])).toBeNull();
    expect(typingText(['Hannah'])).toBe('Hannah is typing…');
    expect(typingText(['Hannah', 'Daniel'])).toBe('Hannah and Daniel are typing…');
    expect(typingText(['Hannah', 'Daniel', 'Caleb'])).toBe('Several people are typing…');
  });
});

describe('activeTypers', () => {
  const now = 10_000;

  it('drops self and events older than TYPING_TTL_MS while keeping exact TTL boundary', () => {
    const events: TypingEvent[] = [
      { user_id: 'me', name: 'Me', at: now - 100 },
      { user_id: 'u1', name: 'Expired', at: now - 5001 },
      { user_id: 'u2', name: 'Boundary', at: now - 5000 },
    ];
    expect(activeTypers(events, 'me', now)).toEqual(['Boundary']);
  });

  it('keeps latest name per user once and preserves first-appearance order', () => {
    const events: TypingEvent[] = [
      { user_id: 'u1', name: 'Han', at: now - 1000 },
      { user_id: 'u1', name: 'Hannah', at: now - 200 },
    ];
    expect(activeTypers(events, 'me', now)).toEqual(['Hannah']);

    const ordered: TypingEvent[] = [
      { user_id: 'u1', name: 'Han', at: now - 1000 },
      { user_id: 'u2', name: 'Daniel', at: now - 500 },
      { user_id: 'u1', name: 'Hannah', at: now - 100 },
    ];
    expect(activeTypers(ordered, 'me', now)).toEqual(['Hannah', 'Daniel']);
  });
});

describe('shouldSendTyping', () => {
  it('returns true when never sent or at/past TYPING_SEND_MS, false before', () => {
    expect(shouldSendTyping(null, 0)).toBe(true);
    expect(shouldSendTyping(1000, 3999)).toBe(false);
    expect(shouldSendTyping(1000, 4000)).toBe(true);
  });
});

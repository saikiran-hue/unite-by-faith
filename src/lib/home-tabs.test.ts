import { describe, expect, it } from 'vitest';
import type { DuoChat, FellowshipPod, LastMessage } from '@/types/database';
import { MATCH_PAGE, TABS, cleanText, pageOf, parseTab, recentChats, relTime, shouldAutoSearch } from './home-tabs';

describe('parseTab', () => {
  it('returns valid tab names unchanged', () => {
    for (const tab of TABS) {
      expect(parseTab(tab)).toBe(tab);
    }
  });

  it('falls back to home for null, undefined, and unknown values', () => {
    expect(parseTab(null)).toBe('home');
    expect(parseTab(undefined)).toBe('home');
    expect(parseTab('bogus')).toBe('home');
    expect(parseTab('')).toBe('home');
  });
});

describe('cleanText', () => {
  it('strips a leading emoji', () => {
    expect(cleanText('🙏 Pray for me')).toBe('Pray for me');
  });

  it('unwraps shared prayer request and goal wrappers', () => {
    expect(cleanText('Shared Prayer Request: "Healing for mum"')).toBe('Healing for mum');
    expect(cleanText('🙏 Shared Prayer Request: "Healing for mum"')).toBe('Healing for mum');
    expect(cleanText('Shared Fellowship Goal: "Read daily"')).toBe('Read daily');
  });

  it('collapses extra whitespace and trims', () => {
    expect(cleanText('  hello   world \n\t there  ')).toBe('hello world there');
  });
});

describe('recentChats', () => {
  const meId = 'user-me';

  const makeDuo = (roomId: string, name: string, avatar: string | null): DuoChat =>
    ({
      chat_room_id: roomId,
      partner: { full_name: name, avatar_url: avatar },
    }) as DuoChat;

  const makePod = (roomId: string, title: string): FellowshipPod =>
    ({
      chat_room_id: roomId,
      title,
    }) as FellowshipPod;

  const makeMsg = (
    content: string,
    created_at: string,
    sender_id = 'user-other',
    message_type = 'text'
  ): LastMessage =>
    ({
      content,
      created_at,
      sender_id,
      message_type,
    }) as LastMessage;

  it('merges duos and pods, sorts newest message first, and puts messageless rooms last by name', () => {
    const duos = [
      makeDuo('room-duo-1', 'Alice', 'https://example.com/alice.png'),
      makeDuo('room-duo-empty', 'Zara', 'https://example.com/zara.png'),
    ];
    const pods = [
      makePod('room-pod-1', 'Morning Fellowship'),
      makePod('room-pod-empty', 'Alpha Group'),
    ];
    const lastMessages: Record<string, LastMessage> = {
      'room-duo-1': makeMsg('Older msg', '2026-11-20T10:00:00.000Z'),
      'room-pod-1': makeMsg('Newer msg', '2026-11-20T12:00:00.000Z'),
    };

    const result = recentChats(duos, pods, lastMessages, meId);

    expect(result.map((c) => c.roomId)).toEqual([
      'room-pod-1',
      'room-duo-1',
      'room-pod-empty',
      'room-duo-empty',
    ]);

    expect(result[0]).toMatchObject({
      roomId: 'room-pod-1',
      kind: 'pod',
      name: 'Morning Fellowship',
      avatar: null,
      pod: pods[0],
      preview: 'Newer msg',
      at: '2026-11-20T12:00:00.000Z',
    });

    expect(result[1]).toMatchObject({
      roomId: 'room-duo-1',
      kind: 'duo',
      name: 'Alice',
      avatar: 'https://example.com/alice.png',
      pod: null,
      preview: 'Older msg',
      at: '2026-11-20T10:00:00.000Z',
    });

    expect(result[2]).toMatchObject({
      roomId: 'room-pod-empty',
      preview: null,
      at: null,
      avatar: null,
    });

    expect(result[3]).toMatchObject({
      roomId: 'room-duo-empty',
      preview: null,
      at: null,
      avatar: 'https://example.com/zara.png',
    });
  });

  it('formats preview prefixes for sender and message types', () => {
    const duos = [
      makeDuo('r-you', 'Bob', null),
      makeDuo('r-prayer', 'Cara', null),
      makeDuo('r-ice', 'Dan', null),
      makeDuo('r-you-prayer', 'Eve', null),
    ];
    const lastMessages: Record<string, LastMessage> = {
      'r-you': makeMsg('Hey there', '2026-11-20T14:00:00.000Z', meId, 'text'),
      'r-prayer': makeMsg(
        '🙏 Shared Prayer Request: "Healing for mum"',
        '2026-11-20T13:00:00.000Z',
        'other',
        'prayer_request'
      ),
      'r-ice': makeMsg('Favorite verse?', '2026-11-20T12:00:00.000Z', 'other', 'icebreaker'),
      'r-you-prayer': makeMsg(
        'Shared Prayer Request: "Peace"',
        '2026-11-20T11:00:00.000Z',
        meId,
        'prayer_request'
      ),
    };

    const result = recentChats(duos, [], lastMessages, meId);
    const byId = Object.fromEntries(result.map((c) => [c.roomId, c.preview]));

    expect(byId['r-you']).toBe('You: Hey there');
    expect(byId['r-prayer']).toBe('Prayer Request: Healing for mum');
    expect(byId['r-ice']).toBe('Conversation Starter: Favorite verse?');
    expect(byId['r-you-prayer']).toBe('You: Prayer Request: Peace');
  });
});

describe('relTime', () => {
  const now = new Date(2026, 10, 20, 15, 0);

  it('formats same-day timestamps as time with AM/PM', () => {
    const sameDayIso = new Date(2026, 10, 20, 9, 5).toISOString();
    expect(relTime(sameDayIso, now)).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });

  it('returns Yesterday for the previous day', () => {
    const yesterdayIso = new Date(2026, 10, 19, 18, 30).toISOString();
    expect(relTime(yesterdayIso, now)).toBe('Yesterday');
  });

  it('returns weekday name for 3 days earlier', () => {
    const threeDaysAgoIso = new Date(2026, 10, 17, 15, 0).toISOString();
    expect(relTime(threeDaysAgoIso, now)).toBe('Tuesday');
  });

  it('returns day and short month for 30 days earlier', () => {
    const thirtyDaysAgoIso = new Date(2026, 9, 21, 15, 0).toISOString();
    expect(relTime(thirtyDaysAgoIso, now)).toBe('21 Oct');
  });
});

describe('relTime calendar edges', () => {
  const now = new Date(2026, 10, 20, 15, 0); // Friday 3 PM
  it('shows a date, not today’s weekday, for a message 7 calendar days ago at a later hour', () => {
    expect(relTime(new Date(2026, 10, 13, 20, 0).toISOString(), now)).toBe('13 Nov');
  });
  it('treats a message just before midnight yesterday as Yesterday', () => {
    expect(relTime(new Date(2026, 10, 19, 23, 59).toISOString(), now)).toBe('Yesterday');
  });
  it('shows a slightly future time (clock skew) as a time today', () => {
    expect(relTime(new Date(2026, 10, 20, 15, 1).toISOString(), now)).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });
});

describe('recentChats unread and deleted', () => {
  const meId = 'user-me';
  const duo = { chat_room_id: 'r1', partner: { full_name: 'Alice', avatar_url: null } } as unknown as DuoChat;
  const pod = { chat_room_id: 'r2', title: 'Group' } as FellowshipPod;
  const msg = (over: Partial<LastMessage>): LastMessage =>
    ({
      content: 'hi',
      created_at: '2026-11-20T10:00:00.000Z',
      sender_id: 'user-other',
      message_type: 'text',
      deleted_at: null,
      ...over,
    }) as LastMessage;

  it('copies unread per room and defaults to 0', () => {
    const r = recentChats([duo], [pod], {}, meId, { r1: 3 });
    expect(r.find((c) => c.roomId === 'r1')?.unread).toBe(3);
    expect(r.find((c) => c.roomId === 'r2')?.unread).toBe(0);
    expect(recentChats([duo], [], {}, meId)[0].unread).toBe(0);
  });

  it('previews a deleted last message, with You: when mine', () => {
    const del = '2026-11-20T11:00:00.000Z';
    const theirs = recentChats([duo], [], { r1: msg({ deleted_at: del, message_type: 'prayer_request' }) }, meId);
    expect(theirs[0].preview).toBe('This message was deleted');
    const mine = recentChats([duo], [], { r1: msg({ deleted_at: del, sender_id: meId }) }, meId);
    expect(mine[0].preview).toBe('You: This message was deleted');
  });
});

describe('shouldAutoSearch', () => {
  const base = { tab: 'matches' as const, hasSearch: false, tooFew: false, signedIn: true, alreadyFired: false };
  it('auto-searches on the Match tab with no search yet', () => expect(shouldAutoSearch(base)).toBe(true));
  it('never on another tab, with a search, with < 3 habits, signed out, or twice', () => {
    for (const o of [{ tab: 'home' as const }, { hasSearch: true }, { tooFew: true }, { signedIn: false }, { alreadyFired: true }])
      expect(shouldAutoSearch({ ...base, ...o })).toBe(false);
  });
});

describe('pageOf', () => {
  it('pageOf: 20 items show all, nothing remaining', () => {
    expect(pageOf(Array.from({ length: 20 }, (_, i) => i), MATCH_PAGE)).toMatchObject({ remaining: 0 });
  });
  it('pageOf: 21 items show 20 then 1 remaining; next page shows 21', () => {
    const xs = Array.from({ length: 21 }, (_, i) => i);
    expect(pageOf(xs, 20)).toMatchObject({ remaining: 1 });
    expect(pageOf(xs, 40).visible).toHaveLength(21);
  });
});

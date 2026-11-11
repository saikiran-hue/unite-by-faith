import { describe, expect, it } from 'vitest';
import { outcomeEventsForMessage } from './outcomes';

const DAY = 86_400_000;
const created = new Date('2026-11-01T00:00:00Z');
const at = (days: number) => new Date(created.getTime() + days * DAY);
const msg = (senderId: string, days: number) => ({ senderId, createdAt: at(days) });

describe('outcomeEventsForMessage', () => {
  it('first reply from the partner emits replied', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'b',
        roomCreatedAt: created,
        now: at(1),
        history: [msg('a', 0), msg('b', 1)],
        priorCount: 0,
        alreadyLogged: new Set(),
      }),
    ).toEqual(['replied']);
  });

  it('a message from the connecting user is not a reply', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'a',
        roomCreatedAt: created,
        now: at(1),
        history: [msg('a', 0), msg('a', 1)],
        priorCount: 0,
        alreadyLogged: new Set(),
      }),
    ).toEqual([]);
  });

  const threeEach = [msg('a', 0), msg('b', 1), msg('a', 2), msg('b', 3), msg('a', 4), msg('b', 6)];

  it('3rd message from each side on day 6 emits active_7d', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'b',
        roomCreatedAt: created,
        now: at(6),
        history: threeEach,
        priorCount: 2,
        alreadyLogged: new Set(['replied']),
      }),
    ).toEqual(['active_7d']);
  });

  it('the same on day 8 emits nothing', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'b',
        roomCreatedAt: created,
        now: at(8),
        history: [...threeEach.slice(0, 5), msg('b', 8)],
        priorCount: 2,
        alreadyLogged: new Set(['replied']),
      }),
    ).toEqual([]);
  });

  it('already logged events are not emitted again', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'b',
        roomCreatedAt: created,
        now: at(6),
        history: threeEach,
        priorCount: 2,
        alreadyLogged: new Set(['replied', 'active_7d']),
      }),
    ).toEqual([]);
  });

  it('pod: sender first message emits replied', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'pod_group',
        senderId: 'c',
        roomCreatedAt: created,
        now: at(1),
        history: [msg('a', 0), msg('c', 1)],
        priorCount: 0,
        alreadyLogged: new Set(),
      }),
    ).toEqual(['replied']);
  });

  it('pod: 3 messages from 2 members within 7 days emits active_7d', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'pod_group',
        senderId: 'c',
        roomCreatedAt: created,
        now: at(3),
        history: [msg('a', 0), msg('c', 1), msg('c', 3)],
        priorCount: 1,
        alreadyLogged: new Set(['replied']),
      }),
    ).toEqual(['active_7d']);
  });

  it('pod: 3 messages from one member is not active', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'pod_group',
        senderId: 'a',
        roomCreatedAt: created,
        now: at(3),
        history: [msg('a', 0), msg('a', 1), msg('a', 3)],
        priorCount: 2,
        alreadyLogged: new Set(['replied']),
      }),
    ).toEqual([]);
  });

  it('first message after the 7-day window still emits replied (duo)', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'duo_1v1',
        senderId: 'b',
        roomCreatedAt: created,
        now: at(9),
        history: [],
        priorCount: 0,
        connectorId: 'a',
        alreadyLogged: new Set(),
      }),
    ).toEqual(['replied']);
  });

  it('first message after the window still emits replied (pod)', () => {
    expect(
      outcomeEventsForMessage({
        roomType: 'pod_group',
        senderId: 'c',
        roomCreatedAt: created,
        now: at(9),
        history: [],
        priorCount: 0,
        alreadyLogged: new Set(),
      }),
    ).toEqual(['replied']);
  });

  it('a later message does not catch up an unlogged replied', () => {
    for (const roomType of ['duo_1v1', 'pod_group'] as const) {
      expect(
        outcomeEventsForMessage({
          roomType,
          senderId: 'b',
          roomCreatedAt: created,
          now: at(2),
          history: [msg('a', 0), msg('b', 1), msg('b', 2)],
          priorCount: 1,
          connectorId: 'a',
          alreadyLogged: new Set(['active_7d']),
        }),
      ).toEqual([]);
    }
  });
});

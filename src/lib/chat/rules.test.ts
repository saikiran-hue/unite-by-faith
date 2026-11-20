import { describe, expect, it } from 'vitest';
import type { ReactionEmoji } from '@/types/database';
import {
  EDIT_WINDOW_MS,
  REACTIONS,
  checkEdit,
  checkReplyTarget,
  isReaction,
  rpcResult,
  snippet,
  type RuleMsg,
} from './rules';

const base: RuleMsg = {
  id: 'm1',
  room_id: 'r1',
  sender_id: 'me',
  message_type: 'text',
  created_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
};

describe('constants', () => {
  it('defines EDIT_WINDOW_MS as 900000 and REACTIONS in exact order', () => {
    const expected: readonly ReactionEmoji[] = ['🙏', '❤️', '👍', '😂', '🙌'];
    expect(EDIT_WINDOW_MS).toBe(900_000);
    expect(REACTIONS).toEqual(expected);
  });
});

describe('checkEdit', () => {
  it('allows edit at exactly created_at (0 ms)', () => {
    expect(checkEdit(base, 'me', 'r1', new Date('2026-11-20T10:00:00.000Z'))).toEqual({
      ok: true,
    });
  });

  it('allows edit at exactly 15 minutes (10:15:00.000Z)', () => {
    expect(checkEdit(base, 'me', 'r1', new Date('2026-11-20T10:15:00.000Z'))).toEqual({
      ok: true,
    });
  });

  it('rejects edit past 15 minutes (10:15:01.000Z)', () => {
    expect(checkEdit(base, 'me', 'r1', new Date('2026-11-20T10:15:01.000Z'))).toEqual({
      ok: false,
      status: 409,
      error: 'edit_window_passed',
    });
  });

  it('rejects edit by another user', () => {
    expect(checkEdit(base, 'you', 'r1', new Date('2026-11-20T10:05:00.000Z'))).toEqual({
      ok: false,
      status: 403,
      error: 'not_your_message',
    });
  });

  it('rejects edit of non-text message', () => {
    expect(
      checkEdit(
        { ...base, message_type: 'prayer_request' },
        'me',
        'r1',
        new Date('2026-11-20T10:05:00.000Z')
      )
    ).toEqual({
      ok: false,
      status: 409,
      error: 'only_text_editable',
    });
  });

  it('rejects edit of deleted message', () => {
    expect(
      checkEdit(
        { ...base, deleted_at: '2026-11-20T10:01:00.000Z' },
        'me',
        'r1',
        new Date('2026-11-20T10:05:00.000Z')
      )
    ).toEqual({
      ok: false,
      status: 409,
      error: 'message_deleted',
    });
  });

  it('returns 404 when message is null or in another room', () => {
    expect(checkEdit(null, 'me', 'r1', new Date('2026-11-20T10:05:00.000Z'))).toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    });
    expect(
      checkEdit({ ...base, room_id: 'r2' }, 'me', 'r1', new Date('2026-11-20T10:05:00.000Z'))
    ).toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    });
  });

  it('refuses when created_at cannot be read', () => {
    expect(
      checkEdit({ ...base, created_at: 'not a date' }, 'me', 'r1', new Date('2026-11-20T10:05:00.000Z'))
    ).toEqual({ ok: false, status: 409, error: 'edit_window_passed' });
  });

  it('allows a just-sent message whose created_at is a little ahead of the server clock', () => {
    expect(checkEdit(base, 'me', 'r1', new Date('2026-11-20T09:59:58.000Z'))).toEqual({ ok: true });
  });
});

describe('checkReplyTarget', () => {
  it('rejects deleted, other-room, and missing targets', () => {
    expect(
      checkReplyTarget({ ...base, deleted_at: '2026-11-20T10:01:00.000Z' }, 'r1')
    ).toEqual({
      ok: false,
      status: 400,
      error: 'reply_target_invalid',
    });
    expect(checkReplyTarget({ ...base, room_id: 'r2' }, 'r1')).toEqual({
      ok: false,
      status: 400,
      error: 'reply_target_invalid',
    });
    expect(checkReplyTarget(null, 'r1')).toEqual({
      ok: false,
      status: 400,
      error: 'reply_target_invalid',
    });
  });

  it('allows replying to non-deleted messages in the same room including icebreakers', () => {
    expect(checkReplyTarget({ ...base, message_type: 'icebreaker' }, 'r1')).toEqual({
      ok: true,
    });
  });
});

describe('isReaction', () => {
  it('accepts allowed emojis and null, rejects others', () => {
    expect(isReaction('🙏')).toBe(true);
    expect(isReaction(null)).toBe(true);
    expect(isReaction('🔥')).toBe(false);
    expect(isReaction(undefined)).toBe(false);
  });
});

describe('rpcResult', () => {
  it('maps SQL result codes to Check objects', () => {
    expect(rpcResult('ok')).toEqual({ ok: true });
    expect(rpcResult('message_not_found')).toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    });
    expect(rpcResult('not_your_message')).toEqual({
      ok: false,
      status: 403,
      error: 'not_your_message',
    });
    expect(rpcResult('message_deleted')).toEqual({
      ok: false,
      status: 409,
      error: 'message_deleted',
    });
    expect(rpcResult('invalid_emoji')).toEqual({
      ok: false,
      status: 400,
      error: 'invalid_emoji',
    });
    expect(rpcResult('unexpected_error')).toEqual({
      ok: false,
      status: 409,
      error: 'unexpected_error',
    });
  });
});

describe('snippet', () => {
  it('collapses newlines and extra whitespace', () => {
    expect(snippet('line one\n\nline   two')).toBe('line one line two');
  });

  it('trims leading and trailing whitespace', () => {
    expect(snippet('   hello world   ')).toBe('hello world');
  });

  it('returns strings shorter than 80 characters unchanged', () => {
    expect(snippet('short message')).toBe('short message');
  });

  it('returns an 80-character string unchanged without ellipsis', () => {
    const exact = 'a'.repeat(80);
    expect(snippet(exact)).toBe(exact);
  });

  it('truncates long strings to 80 characters plus ellipsis', () => {
    expect(snippet('x'.repeat(2000))).toBe(`${'x'.repeat(80)}…`);
  });

  it('counts an emoji as one character and never splits it', () => {
    expect(snippet('🙏'.repeat(100))).toBe(`${'🙏'.repeat(80)}…`);
    expect(snippet(`${'a'.repeat(79)}🙏🙏`)).toBe(`${'a'.repeat(79)}🙏…`);
  });

  it('drops a trailing space before the ellipsis', () => {
    expect(snippet(`${'a'.repeat(79)} bcd`)).toBe(`${'a'.repeat(79)}…`);
  });
});

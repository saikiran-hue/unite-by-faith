import { describe, expect, it, vi } from 'vitest';
import { duoMemberJoins, fetchReplyParent, handleChatAction, loadReads, loadReplyParents } from './chat-actions';

const ROOM = 'room-1';
const ME = 'me';
const ID = '11111111-1111-4111-8111-111111111111';

type Stub = {
  row?: Record<string, unknown> | null;
  updated?: unknown[];
  rpc?: string;
  /** What a plain list read (no update, no maybeSingle) resolves to. */
  rows?: unknown[];
  /** An error for maybeSingle reads. */
  readError?: { message: string } | null;
  /** An error for plain list reads. */
  listError?: { message: string } | null;
};
type Call = [string, ...unknown[]];

/** Minimal chainable admin stub: every filter returns the chain; single reads resolve `row`, list reads `rows`, updates `updated`. */
function stub({ row = null, updated = [], rpc = 'ok', rows = [], readError = null, listError = null }: Stub) {
  const rpcFn = vi.fn(async () => ({ data: rpc, error: null }));
  const chain: Record<string, unknown> = {};
  const calls: Call[] = [];
  let updating = false;
  for (const f of ['from', 'select', 'eq', 'is', 'in']) {
    chain[f] = (...args: unknown[]) => {
      calls.push([f, ...args]);
      return chain;
    };
  }
  chain.update = (...args: unknown[]) => {
    calls.push(['update', ...args]);
    updating = true;
    return chain;
  };
  chain.maybeSingle = async () => ({ data: readError ? null : row, error: readError });
  chain.then = (res: (v: unknown) => unknown) =>
    res(listError ? { data: null, error: listError } : { data: updating ? updated : rows, error: null });
  const admin = { from: chain.from, rpc: rpcFn };
  return { admin: admin as never, rpcFn, calls };
}

const fresh = () => new Date().toISOString();
const own = (over = {}) => ({
  id: ID,
  room_id: ROOM,
  sender_id: ME,
  message_type: 'text',
  created_at: fresh(),
  deleted_at: null,
  ...over,
});

async function run(s: ReturnType<typeof stub>, body: Record<string, unknown>) {
  const res = await handleChatAction(s.admin, ROOM, ME, body);
  return res && { status: res.status, json: await res.json() };
}

describe('handleChatAction', () => {
  it('returns null for an unknown action', async () => {
    expect(await run(stub({}), { action: 'message' })).toBeNull();
  });

  it('a malformed message id is 404 before any query', async () => {
    const s = stub({});
    const r = await run(s, { action: 'delete_message', messageId: '' });
    expect(r).toEqual({ status: 404, json: { error: 'message_not_found' } });
    expect(s.rpcFn).not.toHaveBeenCalled();
  });

  it('edit by a non-owner is 403', async () => {
    const r = await run(stub({ row: own({ sender_id: 'other' }) }), {
      action: 'edit_message', messageId: ID, content: 'hi',
    });
    expect(r).toEqual({ status: 403, json: { error: 'not_your_message' } });
  });

  it('edit after the window is 409 edit_window_passed', async () => {
    const old = new Date(Date.now() - 16 * 60_000).toISOString();
    const r = await run(stub({ row: own({ created_at: old }) }), {
      action: 'edit_message', messageId: ID, content: 'hi',
    });
    expect(r).toEqual({ status: 409, json: { error: 'edit_window_passed' } });
  });

  it('edit whose guarded update hits 0 rows is 409 message_deleted', async () => {
    const r = await run(stub({ row: own(), updated: [] }), {
      action: 'edit_message', messageId: ID, content: 'hi',
    });
    expect(r).toEqual({ status: 409, json: { error: 'message_deleted' } });
  });

  it('edit whose target read fails is 500, not 404', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = stub({ readError: { message: 'connection reset' } });
    const r = await run(s, { action: 'edit_message', messageId: ID, content: 'hi' });
    quiet.mockRestore();
    expect(r).toEqual({ status: 500, json: { error: 'connection reset' } });
    expect(s.calls.some((c) => c[0] === 'update')).toBe(false);
  });

  it('edit succeeds and returns the row', async () => {
    const s = stub({ row: own(), updated: [{ id: ID, content: 'hi' }] });
    const r = await run(s, { action: 'edit_message', messageId: ID, content: '  hi  ' });
    expect(r?.status).toBe(200);
    expect(r?.json.message.id).toBe(ID);
    const upd = s.calls.findIndex((c) => c[0] === 'update');
    expect(s.calls[upd][1]).toMatchObject({ content: 'hi' });
    const guards = s.calls.slice(upd + 1);
    expect(guards).toEqual(
      expect.arrayContaining([
        ['eq', 'id', ID],
        ['eq', 'room_id', ROOM],
        ['eq', 'sender_id', ME],
        ['eq', 'message_type', 'text'],
        ['is', 'deleted_at', null],
      ])
    );
  });

  it('react with a bad emoji is 400 without calling rpc', async () => {
    const s = stub({});
    const r = await run(s, { action: 'react', messageId: ID, emoji: '🔥' });
    expect(r).toEqual({ status: 400, json: { error: 'invalid_emoji' } });
    expect(s.rpcFn).not.toHaveBeenCalled();
  });

  it('react with null removes via rpc', async () => {
    const s = stub({});
    const r = await run(s, { action: 'react', messageId: ID, emoji: null });
    expect(r?.status).toBe(200);
    expect(s.rpcFn).toHaveBeenCalledWith('react_to_message', {
      p_message: ID, p_user: ME, p_room: ROOM, p_emoji: null,
    });
  });

  it('delete maps rpc not_your_message to 403', async () => {
    const r = await run(stub({ rpc: 'not_your_message' }), {
      action: 'delete_message', messageId: ID,
    });
    expect(r).toEqual({ status: 403, json: { error: 'not_your_message' } });
  });

  it('delete_message passes message, user and room to the rpc', async () => {
    const s = stub({});
    await run(s, { action: 'delete_message', messageId: ID });
    expect(s.rpcFn).toHaveBeenCalledWith('delete_chat_message', {
      p_message: ID, p_user: ME, p_room: ROOM,
    });
  });

  it('mark_read calls mark_room_read with room and user', async () => {
    const s = stub({});
    const r = await run(s, { action: 'mark_read' });
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(s.rpcFn).toHaveBeenCalledWith('mark_room_read', { p_room: ROOM, p_user: ME });
  });
});

describe('fetchReplyParent', () => {
  it('a non-UUID reply target is 400 without querying', async () => {
    const s = stub({});
    expect(await fetchReplyParent(s.admin, ROOM, 'nope')).toMatchObject({
      ok: false, status: 400, error: 'reply_target_invalid',
    });
    expect(s.calls).toEqual([]);
  });

  it('a failed parent read throws instead of calling the target invalid', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = stub({ readError: { message: 'connection reset' } });
    await expect(fetchReplyParent(s.admin, ROOM, ID)).rejects.toThrow('connection reset');
    quiet.mockRestore();
  });

  it('a deleted reply target is 400 reply_target_invalid', async () => {
    const s = stub({ row: own({ deleted_at: fresh() }) });
    expect(await fetchReplyParent(s.admin, ROOM, ID)).toEqual({
      ok: false, status: 400, error: 'reply_target_invalid',
    });
  });
});

describe('loadReplyParents', () => {
  const reply = { id: 'm2', sender_id: 'u1', content: 'yes', deleted_at: null, reply_to_id: 'm1' };

  it('fetches a quoted parent older than the loaded window', async () => {
    const parent = { id: 'm1', sender_id: 'u2', content: 'older', deleted_at: null };
    const s = stub({ rows: [parent] });
    expect((await loadReplyParents(s.admin, ROOM, [reply])).get('m1')).toEqual(parent);
  });

  it('a failed parent read throws instead of dropping the quote', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = stub({ listError: { message: 'connection reset' } });
    await expect(loadReplyParents(s.admin, ROOM, [reply])).rejects.toThrow('connection reset');
    quiet.mockRestore();
  });
});

describe('loadReads for a 1v1', () => {
  const PARTNER = 'partner';
  const duo = { user_a_id: ME, user_b_id: PARTNER, created_at: '2026-11-20T09:00:00.000+00:00' };

  it('returns only the partner, joined when the match was made, with their read mark', async () => {
    const s = stub({ rows: [{ user_id: PARTNER, last_read_at: '2026-11-20T10:00:00+00:00' }] });
    expect(await loadReads(s.admin, ROOM, ME, duoMemberJoins(duo))).toEqual([
      { user_id: PARTNER, last_read_at: '2026-11-20T10:00:00+00:00', joined_at: duo.created_at },
    ]);
    expect(s.calls).toEqual(
      expect.arrayContaining([
        ['from', 'room_reads'],
        ['eq', 'room_id', ROOM],
        ['in', 'user_id', [PARTNER]],
      ])
    );
  });

  it('gives a partner who never opened the chat a null read mark', async () => {
    const s = stub({ rows: [] });
    expect(await loadReads(s.admin, ROOM, ME, duoMemberJoins(duo))).toEqual([
      { user_id: PARTNER, last_read_at: null, joined_at: duo.created_at },
    ]);
  });

  it('leaves the viewer out whichever side of the pair they are', async () => {
    const s = stub({ rows: [{ user_id: ME, last_read_at: '2026-11-20T10:00:00+00:00' }] });
    const flipped = { ...duo, user_a_id: PARTNER, user_b_id: ME };
    expect(await loadReads(s.admin, ROOM, ME, duoMemberJoins(flipped))).toEqual([
      { user_id: PARTNER, last_read_at: null, joined_at: duo.created_at },
    ]);
  });
});

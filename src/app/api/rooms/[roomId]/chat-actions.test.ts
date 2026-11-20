import { describe, expect, it, vi } from 'vitest';
import { fetchReplyParent, handleChatAction } from './chat-actions';

const ROOM = 'room-1';
const ME = 'me';
const ID = '11111111-1111-4111-8111-111111111111';

type Stub = { row?: Record<string, unknown> | null; updated?: unknown[]; rpc?: string };
type Call = [string, ...unknown[]];

/** Minimal chainable admin stub: every filter returns the chain; reads resolve `row`, updates `updated`. */
function stub({ row = null, updated = [], rpc = 'ok' }: Stub) {
  const rpcFn = vi.fn(async () => ({ data: rpc, error: null }));
  const chain: Record<string, unknown> = {};
  const calls: Call[] = [];
  let updating = false;
  for (const f of ['select', 'eq', 'is']) {
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
  chain.maybeSingle = async () => ({ data: row });
  chain.then = (res: (v: unknown) => unknown) =>
    res({ data: updating ? updated : [], error: null });
  const admin = { from: () => chain, rpc: rpcFn };
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

  it('a deleted reply target is 400 reply_target_invalid', async () => {
    const s = stub({ row: own({ deleted_at: fresh() }) });
    expect(await fetchReplyParent(s.admin, ROOM, ID)).toEqual({
      ok: false, status: 400, error: 'reply_target_invalid',
    });
  });
});

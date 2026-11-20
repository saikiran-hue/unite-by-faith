import { beforeEach, describe, expect, it, vi } from 'vitest';

type Res = { data?: unknown; error?: { message: string } | null };

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Res>,
  member: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
}));

/** Admin stub answering per table: every filter returns the chain; reads resolve that table's result. */
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const res = () => ({ data: h.tables[table]?.data ?? null, error: h.tables[table]?.error ?? null });
      const chain: Record<string, unknown> = {};
      for (const f of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'update', 'insert']) {
        chain[f] = () => chain;
      }
      chain.maybeSingle = async () => res();
      chain.single = async () => res();
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(res()).then(ok, bad);
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock('@/lib/session', () => ({ requireUserId: async () => ({ userId: 'me' }) }));
vi.mock('@/lib/rooms', () => ({ isRoomMember: (...args: unknown[]) => h.member(...args) }));

import { GET, POST } from './route';

const ROOM = 'room-1';
const params = { params: Promise.resolve({ roomId: ROOM }) };
const fail = { message: 'connection reset' };

async function get() {
  const res = await GET({} as never, params);
  return { status: res.status, json: await res.json() };
}

async function post(body: Record<string, unknown>) {
  const res = await POST({ json: async () => body } as never, params);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  h.member.mockReset();
  h.member.mockResolvedValue(true);
  h.tables = {
    chat_rooms: { data: { id: ROOM, room_type: 'duo_1v1', shared_tags: [] } },
    taxonomy_tags: { data: [] },
    profiles: { data: { id: 'me', full_name: 'Me Person' } },
    user_tags: { data: [] },
    chat_messages: { data: [] },
    room_pins: { data: [] },
  };
});

describe('GET /api/rooms/[roomId]', () => {
  it('loads when every read works (the stub is sound)', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.messages).toEqual([]);
  });

  it.each(['chat_rooms', 'taxonomy_tags', 'profiles', 'user_tags', 'chat_messages', 'room_pins', 'duo_matches'])(
    'a failed %s read is a 500, never an empty room or a sign-out',
    async (table) => {
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.tables[table] = { error: fail };
      const r = await get();
      quiet.mockRestore();
      expect(r).toEqual({ status: 500, json: { error: 'connection reset' } });
    }
  );

  it.each(['pods', 'pod_members'])('a failed %s read in a pod room is a 500, not a room with no one in it', async (table) => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.tables.chat_rooms = { data: { id: ROOM, room_type: 'pod_group', shared_tags: [] } };
    h.tables.pods = { data: { id: 'pod-1' } };
    h.tables.pod_members = { data: [] };
    h.tables[table] = { error: fail };
    const r = await get();
    quiet.mockRestore();
    expect(r).toEqual({ status: 500, json: { error: 'connection reset' } });
  });

  it('a room that is really not there is still 404', async () => {
    h.tables.chat_rooms = { data: null };
    expect(await get()).toEqual({ status: 404, json: { error: 'Chat room not found' } });
  });

  it('a profile read that works but finds no row is 401 signed_out', async () => {
    h.tables.profiles = { data: null };
    expect(await get()).toEqual({ status: 401, json: { error: 'signed_out' } });
  });

  it('a failed membership read is a 500, not 403 not_a_member', async () => {
    h.member.mockRejectedValue(new Error('membership read failed: connection reset'));
    expect(await get()).toEqual({
      status: 500,
      json: { error: 'membership read failed: connection reset' },
    });
  });
});

describe('POST', () => {
  it('a failed room read is a 500, not "Chat room not found"', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.tables.chat_rooms = { error: fail };
    const r = await post({ action: 'amen_pin', pinId: 'pin-1' });
    quiet.mockRestore();
    expect(r).toEqual({ status: 500, json: { error: 'connection reset' } });
  });

  it('a failed membership read is a 500, not 403 not_a_member', async () => {
    h.member.mockRejectedValue(new Error('membership read failed: connection reset'));
    expect(await post({ action: 'amen_pin', pinId: 'pin-1' })).toEqual({
      status: 500,
      json: { error: 'membership read failed: connection reset' },
    });
  });
});

describe('POST pin actions', () => {
  it.each(['amen_pin', 'toggle_answered'])('a failed pin read in %s is a 500, not pin_not_found', async (action) => {
    h.tables.room_pins = { error: fail };
    expect(await post({ action, pinId: 'pin-1' })).toEqual({
      status: 500,
      json: { error: 'connection reset' },
    });
  });

  it('a pin that is really gone is still 404 pin_not_found', async () => {
    h.tables.room_pins = { data: null };
    expect(await post({ action: 'amen_pin', pinId: 'pin-1' })).toEqual({
      status: 404,
      json: { error: 'pin_not_found' },
    });
  });
});

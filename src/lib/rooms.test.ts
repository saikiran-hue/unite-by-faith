import { describe, expect, it } from 'vitest';
import { isRoomMember } from './rooms';

type Res = { data?: unknown; error?: { message: string } | null };

/** Admin stub answering per table: every filter returns the chain; maybeSingle resolves that table's result. */
function admin(tables: Record<string, Res>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const f of ['select', 'eq', 'or']) chain[f] = () => chain;
      chain.maybeSingle = async () => ({ data: tables[table]?.data ?? null, error: tables[table]?.error ?? null });
      return chain;
    },
  } as never;
}

const pod = { id: 'room-1', room_type: 'pod_group' };
const duo = { id: 'room-2', room_type: 'duo_1v1' };
const fail = { message: 'connection reset' };

describe('isRoomMember', () => {
  it('answers from the membership rows', async () => {
    expect(await isRoomMember(admin({ pods: { data: { id: 'p1' } }, pod_members: { data: { user_id: 'me' } } }), pod, 'me')).toBe(true);
    expect(await isRoomMember(admin({ pods: { data: { id: 'p1' } }, pod_members: { data: null } }), pod, 'me')).toBe(false);
    expect(await isRoomMember(admin({ pods: { data: null } }), pod, 'me')).toBe(false);
    expect(await isRoomMember(admin({ duo_matches: { data: { id: 'd1' } } }), duo, 'me')).toBe(true);
    expect(await isRoomMember(admin({ duo_matches: { data: null } }), duo, 'me')).toBe(false);
  });

  it('throws on a failed read instead of saying "not a member"', async () => {
    await expect(isRoomMember(admin({ pods: { error: fail } }), pod, 'me')).rejects.toThrow('connection reset');
    await expect(
      isRoomMember(admin({ pods: { data: { id: 'p1' } }, pod_members: { error: fail } }), pod, 'me')
    ).rejects.toThrow('connection reset');
    await expect(isRoomMember(admin({ duo_matches: { error: fail } }), duo, 'me')).rejects.toThrow('connection reset');
  });
});

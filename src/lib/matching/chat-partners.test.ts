import { describe, expect, it } from 'vitest';
import { splitChatPartners } from './chat-partners';

const row = (a: string, b: string, room: string | null = 'r') => ({ user_a_id: a, user_b_id: b, chat_room_id: room });

describe('splitChatPartners', () => {
  it('drops partners in either direction', () => {
    expect(splitChatPartners('v', ['x', 'y', 'z'], [row('v', 'x'), row('y', 'v')]))
      .toEqual({ keep: ['z'], allChatted: false });
  });
  it('keeps someone whose duo row has no room yet', () => {
    expect(splitChatPartners('v', ['x'], [row('v', 'x', null)]).keep).toEqual(['x']);
  });
  it('reports allChatted only when there were candidates and all are partners', () => {
    expect(splitChatPartners('v', ['x'], [row('v', 'x')])).toEqual({ keep: [], allChatted: true });
    expect(splitChatPartners('v', [], [])).toEqual({ keep: [], allChatted: false });
  });
  it('keeps candidate order', () => {
    expect(splitChatPartners('v', ['c', 'a', 'b'], []).keep).toEqual(['c', 'a', 'b']);
  });
  it('ignores rows that do not involve the viewer', () => {
    expect(splitChatPartners('v', ['x'], [row('x', 'y')])).toEqual({ keep: ['x'], allChatted: false });
  });
});

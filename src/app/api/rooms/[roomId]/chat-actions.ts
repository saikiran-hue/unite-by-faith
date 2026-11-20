import { NextResponse } from 'next/server';
import type { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkEdit, checkReplyTarget, isReaction, rpcResult, type Check } from '@/lib/chat/rules';
import type { MemberRead } from '@/types/database';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE_COLUMNS = 'id, room_id, sender_id, message_type, created_at, deleted_at';

/** Same trim rule for sending and editing. */
export function trimContent(raw: unknown): string {
  return String(raw || '').trim();
}

export function emptyContentResponse() {
  return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 });
}

export function checkResponse(check: Extract<Check, { ok: false }>) {
  return NextResponse.json({ error: check.error }, { status: check.status });
}

/** The parent a reply points at, for the reply-target rule. */
export async function fetchReplyParent(admin: Admin, roomId: string, replyToId: string) {
  if (!UUID.test(replyToId)) return checkReplyTarget(null, roomId);
  const { data } = await admin
    .from('chat_messages')
    .select(RULE_COLUMNS)
    .eq('id', replyToId)
    .eq('room_id', roomId)
    .maybeSingle();
  return checkReplyTarget(data, roomId);
}

async function rpcAction(
  admin: Admin,
  fn: 'delete_chat_message' | 'react_to_message',
  args: Record<string, unknown>
) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const check = rpcResult(String(data));
  return check.ok ? NextResponse.json({ ok: true }) : checkResponse(check);
}

/** Reply, edit, delete, react and read-state actions. Null when the action is not one of these. */
export async function handleChatAction(
  admin: Admin,
  roomId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse | null> {
  const messageId = String(body.messageId || '');
  const needsMessage = ['edit_message', 'delete_message', 'react'].includes(String(body.action));
  if (needsMessage && !UUID.test(messageId)) {
    return NextResponse.json({ error: 'message_not_found' }, { status: 404 });
  }

  if (body.action === 'edit_message') {
    const content = trimContent(body.content);
    if (!content) return emptyContentResponse();
    const { data: msg } = await admin
      .from('chat_messages')
      .select(RULE_COLUMNS)
      .eq('id', messageId)
      .maybeSingle();
    const check = checkEdit(msg, userId, roomId, new Date());
    if (!check.ok) return checkResponse(check);

    // The guards repeat in SQL so a delete that lands between the read and write wins.
    const { data: rows, error } = await admin
      .from('chat_messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('room_id', roomId)
      .eq('sender_id', userId)
      .eq('message_type', 'text')
      .is('deleted_at', null)
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'message_deleted' }, { status: 409 });
    }
    return NextResponse.json({ message: rows[0] });
  }

  if (body.action === 'delete_message') {
    return rpcAction(admin, 'delete_chat_message', {
      p_message: messageId,
      p_user: userId,
      p_room: roomId,
    });
  }

  if (body.action === 'react') {
    if (!isReaction(body.emoji)) {
      return NextResponse.json({ error: 'invalid_emoji' }, { status: 400 });
    }
    return rpcAction(admin, 'react_to_message', {
      p_message: messageId,
      p_user: userId,
      p_room: roomId,
      p_emoji: body.emoji,
    });
  }

  if (body.action === 'mark_read') {
    const { error } = await admin.rpc('mark_room_read', { p_room: roomId, p_user: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return null;
}

type Parent = { id: string; sender_id: string; content: string; deleted_at: string | null };

/** Reply parents by id, including ones older than the loaded window (same room only). */
export async function loadReplyParents(
  admin: Admin,
  roomId: string,
  messages: (Parent & { reply_to_id: string | null })[]
): Promise<Map<string, Parent>> {
  const parents = new Map<string, Parent>(messages.map((m) => [m.id, m]));
  const missing = [
    ...new Set(
      messages.flatMap((m) => (m.reply_to_id && !parents.has(m.reply_to_id) ? [m.reply_to_id] : []))
    ),
  ];
  if (missing.length > 0) {
    const { data, error } = await admin
      .from('chat_messages')
      .select('id, sender_id, content, deleted_at')
      .in('id', missing)
      .eq('room_id', roomId);
    if (error) console.error('reply parents read failed', error.message);
    for (const p of (data || []) as Parent[]) parents.set(p.id, p);
  }
  return parents;
}

/** Read state of the other members; joined_at lets the client tell "not read yet" from "joined later". */
export async function loadReads(
  admin: Admin,
  roomId: string,
  viewerId: string,
  members: { user_id: string; joined_at: string }[]
): Promise<MemberRead[]> {
  const others = members.filter((m) => m.user_id !== viewerId);
  if (others.length === 0) return [];
  const { data, error } = await admin
    .from('room_reads')
    .select('user_id, last_read_at')
    .eq('room_id', roomId)
    .in('user_id', others.map((m) => m.user_id));
  if (error) console.error('room reads read failed', error.message);
  const readAt = new Map((data || []).map((r) => [r.user_id as string, r.last_read_at as string]));
  return others.map((m) => ({
    user_id: m.user_id,
    last_read_at: readAt.get(m.user_id) ?? null,
    joined_at: m.joined_at,
  }));
}

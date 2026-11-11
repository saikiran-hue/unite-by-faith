import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type MessageOutcome = 'replied' | 'active_7d';

const WINDOW_MS = 7 * 86_400_000;
const ACTIVE_MESSAGES = 3;

export interface OutcomeMessageInput {
  roomType: 'duo_1v1' | 'pod_group';
  senderId: string;
  roomCreatedAt: Date;
  now: Date;
  /** Room messages oldest first, including the one just sent. */
  history: { senderId: string; createdAt: Date }[];
  alreadyLogged: Set<MessageOutcome>;
  /** Duo only: the user who tapped Connect. Defaults to the first message's sender. */
  connectorId?: string;
}

/** Which of `replied` / `active_7d` this message newly earns. Never repeats a logged event. */
export function outcomeEventsForMessage(input: OutcomeMessageInput): MessageOutcome[] {
  const { roomType, senderId, roomCreatedAt, now, history, alreadyLogged } = input;
  const out: MessageOutcome[] = [];

  let replied: boolean;
  if (roomType === 'duo_1v1') {
    const connector = input.connectorId ?? history[0]?.senderId;
    replied = connector !== undefined && senderId !== connector;
  } else {
    replied = history.some((m) => m.senderId === senderId);
  }
  if (replied && !alreadyLogged.has('replied')) out.push('replied');

  const windowEnd = roomCreatedAt.getTime() + WINDOW_MS;
  if (now.getTime() <= windowEnd && !alreadyLogged.has('active_7d')) {
    const counts = new Map<string, number>();
    let total = 0;
    for (const m of history) {
      if (m.createdAt.getTime() > windowEnd) continue;
      counts.set(m.senderId, (counts.get(m.senderId) ?? 0) + 1);
      total += 1;
    }
    const active =
      roomType === 'duo_1v1'
        ? counts.size === 2 && [...counts.values()].every((n) => n >= ACTIVE_MESSAGES)
        : total >= ACTIVE_MESSAGES && counts.size >= 2;
    if (active) out.push('active_7d');
  }
  return out;
}

async function insertOutcome(
  admin: Admin,
  viewerId: string,
  kind: 'duo' | 'pod',
  targetId: string,
  event: string,
) {
  const { data: shown } = await admin
    .from('match_events')
    .select('score, breakdown, weights_version')
    .eq('viewer_id', viewerId)
    .eq('target_id', targetId)
    .eq('event', 'shown')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from('match_events').insert({
    viewer_id: viewerId,
    kind,
    target_id: targetId,
    event,
    score: shown?.score ?? null,
    breakdown: shown?.breakdown ?? null,
    weights_version: shown?.weights_version ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Logs a one-off outcome (connected / joined) once per viewer and target. Never throws. */
export async function recordOutcome(
  admin: Admin,
  viewerId: string,
  kind: 'duo' | 'pod',
  targetId: string,
  event: 'connected' | 'joined' | 'left_pod',
): Promise<void> {
  try {
    if (event !== 'left_pod') {
      const { data } = await admin
        .from('match_events')
        .select('id')
        .eq('viewer_id', viewerId)
        .eq('target_id', targetId)
        .eq('event', event)
        .limit(1);
      if (data && data.length > 0) return;
    }
    await insertOutcome(admin, viewerId, kind, targetId, event);
  } catch (e) {
    console.error(`outcome ${event} failed`, e);
  }
}

/** After a message is stored: logs replied / active_7d for the room. Never throws. */
export async function recordMessageOutcomes(
  admin: Admin,
  roomId: string,
  senderId: string,
  now: Date,
): Promise<void> {
  try {
    const { data: room } = await admin
      .from('chat_rooms')
      .select('room_type, created_at')
      .eq('id', roomId)
      .single();
    if (!room) return;
    const roomCreatedAt = new Date(room.created_at);
    const windowEnd = new Date(roomCreatedAt.getTime() + WINDOW_MS).toISOString();
    const roomType = room.room_type as 'duo_1v1' | 'pod_group';

    let viewerId = senderId;
    let targetId: string;
    let kind: 'duo' | 'pod';
    let connectorId: string | undefined;

    if (roomType === 'duo_1v1') {
      const { data: duo } = await admin
        .from('duo_matches')
        .select('user_a_id, user_b_id')
        .eq('chat_room_id', roomId)
        .maybeSingle();
      if (!duo) return;
      const { data: conn } = await admin
        .from('match_events')
        .select('viewer_id, target_id')
        .eq('kind', 'duo')
        .eq('event', 'connected')
        .in('viewer_id', [duo.user_a_id, duo.user_b_id])
        .in('target_id', [duo.user_a_id, duo.user_b_id])
        .order('created_at', { ascending: true })
        .limit(1);
      connectorId = conn?.[0]?.viewer_id ?? duo.user_a_id;
      viewerId = connectorId!;
      targetId = connectorId === duo.user_a_id ? duo.user_b_id : duo.user_a_id;
      kind = 'duo';
    } else {
      const { data: pod } = await admin
        .from('pods')
        .select('id')
        .eq('chat_room_id', roomId)
        .maybeSingle();
      if (!pod) return;
      targetId = pod.id;
      kind = 'pod';
    }

    const [{ data: msgs }, { data: logged }] = await Promise.all([
      admin
        .from('chat_messages')
        .select('sender_id, created_at')
        .eq('room_id', roomId)
        .lte('created_at', windowEnd)
        .order('created_at', { ascending: true })
        .limit(500),
      admin
        .from('match_events')
        .select('event')
        .eq('viewer_id', viewerId)
        .eq('target_id', targetId)
        .in('event', ['replied', 'active_7d']),
    ]);

    const events = outcomeEventsForMessage({
      roomType,
      senderId,
      roomCreatedAt,
      now,
      history: (msgs ?? []).map((m) => ({ senderId: m.sender_id, createdAt: new Date(m.created_at) })),
      alreadyLogged: new Set((logged ?? []).map((r) => r.event as MessageOutcome)),
      connectorId,
    });
    for (const event of events) await insertOutcome(admin, viewerId, kind, targetId, event);
  } catch (e) {
    console.error('message outcomes failed', e);
  }
}

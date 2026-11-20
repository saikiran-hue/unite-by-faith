import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * True when the user sits in this room: a pod member for pod rooms, either partner for 1v1 rooms.
 * A failed read throws (callers answer 500) instead of passing for "not a member".
 */
export async function isRoomMember(
  admin: Admin,
  room: { id: string; room_type: string },
  userId: string
): Promise<boolean> {
  if (room.room_type === 'pod_group') {
    const { data: pod, error: podErr } = await admin
      .from('pods')
      .select('id')
      .eq('chat_room_id', room.id)
      .maybeSingle();
    if (podErr) throw new Error(`membership read failed: ${podErr.message}`);
    if (!pod) return false;
    const { data, error } = await admin
      .from('pod_members')
      .select('user_id')
      .eq('pod_id', pod.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`membership read failed: ${error.message}`);
    return Boolean(data);
  }
  const { data, error } = await admin
    .from('duo_matches')
    .select('id')
    .eq('chat_room_id', room.id)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw new Error(`membership read failed: ${error.message}`);
  return Boolean(data);
}

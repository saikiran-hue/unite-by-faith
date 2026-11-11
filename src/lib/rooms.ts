import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** True when the user sits in this room: a pod member for pod rooms, either partner for 1v1 rooms. */
export async function isRoomMember(
  admin: Admin,
  room: { id: string; room_type: string },
  userId: string
): Promise<boolean> {
  if (room.room_type === 'pod_group') {
    const { data: pod } = await admin
      .from('pods')
      .select('id')
      .eq('chat_room_id', room.id)
      .maybeSingle();
    if (!pod) return false;
    const { data } = await admin
      .from('pod_members')
      .select('user_id')
      .eq('pod_id', pod.id)
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await admin
    .from('duo_matches')
    .select('id')
    .eq('chat_room_id', room.id)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .maybeSingle();
  return Boolean(data);
}

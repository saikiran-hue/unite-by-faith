interface DuoRow {
  user_a_id: string;
  user_b_id: string;
  chat_room_id: string | null;
}

/** Drops candidates the viewer already has a 1v1 chat with (a duo row with a room, either direction). */
export function splitChatPartners(
  viewerId: string,
  candidateIds: string[],
  duoRows: DuoRow[],
): { keep: string[]; allChatted: boolean } {
  const partners = new Set<string>();
  for (const r of duoRows) {
    if (!r.chat_room_id) continue;
    partners.add(r.user_a_id === viewerId ? r.user_b_id : r.user_a_id);
  }
  const keep = candidateIds.filter((id) => !partners.has(id));
  return { keep, allChatted: candidateIds.length > 0 && keep.length === 0 };
}

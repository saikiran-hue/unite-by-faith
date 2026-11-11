import { after, NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { recordOutcome } from '@/lib/matching/outcomes';
import { loadPeople, loadScoreContext } from '@/lib/matching/load';
import { scorePair } from '@/lib/matching/score';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const partnerId = String(body.partnerId || '');
    const sharedTags: string[] = Array.isArray(body.sharedTags)
      ? body.sharedTags
      : [];

    if (!partnerId) {
      return NextResponse.json(
        { error: 'partnerId is required' },
        { status: 400 }
      );
    }
    if (partnerId === userId) {
      return NextResponse.json(
        { error: 'Cannot match with yourself' },
        { status: 400 }
      );
    }

    // An existing 1v1 room for the pair always opens, whatever the rules say today.
    const [a, b] = userId < partnerId ? [userId, partnerId] : [partnerId, userId];
    const { data: existing } = await admin
      .from('duo_matches')
      .select('id, chat_room_id, similarity_score')
      .eq('user_a_id', a)
      .eq('user_b_id', b)
      .maybeSingle();
    if (existing?.chat_room_id) {
      return NextResponse.json({
        duo_id: existing.id,
        chat_room_id: existing.chat_room_id,
        similarity_score: existing.similarity_score,
      });
    }

    const { data: allowed, error: ruleErr } = await admin.rpc('duo_pair_allowed', {
      viewer: userId,
      other: partnerId,
    });
    if (ruleErr) throw new Error(`duo_pair_allowed: ${ruleErr.message}`);
    if (!allowed) {
      return NextResponse.json(
        { error: 'You can’t start a 1v1 chat with this person.', code: 'not_eligible' },
        { status: 403 }
      );
    }

    // Score on the server, the same way /api/match ranks the pair.
    const people = await loadPeople(admin, [userId, partnerId]);
    const viewer = people.get(userId);
    const partner = people.get(partnerId);
    if (!viewer || !partner) throw new Error('Pair could not be loaded');
    const { ctx } = await loadScoreContext(
      admin,
      [...viewer.match.tags, ...partner.match.tags].map((t) => t.slug),
      viewer.match.isDemo
    );
    const similarityScore = scorePair(viewer.match, partner.match, ctx).score;

    const { data, error } = await admin.rpc('start_or_get_duo_chat', {
      p_user_id: userId,
      p_partner_id: partnerId,
      p_shared_tags: sharedTags,
      p_similarity_score: similarityScore,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    after(() => recordOutcome(admin, userId, 'duo', partnerId, 'connected'));

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

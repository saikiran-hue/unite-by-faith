import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';

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
    const similarityScore = Number(body.similarityScore || 90);

    if (!partnerId) {
      return NextResponse.json(
        { error: 'partnerId is required' },
        { status: 400 }
      );
    }

    const { data, error } = await admin.rpc('start_or_get_duo_chat', {
      p_user_id: userId,
      p_partner_id: partnerId,
      p_shared_tags: sharedTags,
      p_similarity_score: similarityScore,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

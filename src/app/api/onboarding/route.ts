import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { PillarCategory } from '@/types/database';

interface IncomingTag {
  slug: string;
  category: PillarCategory;
  isPriority: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const fullName = String(body.fullName || 'Believer').trim();
    const headline = String(
      body.headline || 'Fellowship Member'
    ).trim();
    const bio = String(body.bio || '').trim();
    const denomination = String(
      body.denomination || 'Non-Denominational'
    ).trim();
    const church = String(body.church || '').trim();
    const locationCity = String(body.locationCity || 'Bengaluru, IN').trim();
    const yearsInFaith = String(
      body.yearsInFaith || '5+ years in Christ'
    ).trim();
    const fellowshipMode =
      body.fellowshipMode === 'group_only' || body.fellowshipMode === 'duo_only'
        ? body.fellowshipMode
        : 'both';
    const avatarUrl =
      String(body.avatarUrl || '').trim() ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240&auto=format&fit=crop&q=80';

    const { error: updateProfErr } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        headline,
        bio,
        denomination_or_tradition: denomination,
        church_or_fellowship: church,
        location_city: locationCity,
        years_in_faith: yearsInFaith,
        fellowship_mode: fellowshipMode,
        avatar_url: avatarUrl,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateProfErr) {
      return NextResponse.json(
        { error: updateProfErr.message },
        { status: 500 }
      );
    }

    // Replace user_tags atomically
    const selectedTags = (body.selectedTags || []) as IncomingTag[];
    await admin.from('user_tags').delete().eq('user_id', userId);

    if (selectedTags.length > 0) {
      const rows = selectedTags.map((t) => ({
        user_id: userId,
        tag_slug: t.slug,
        category: t.category,
        is_priority: Boolean(t.isPriority),
      }));

      const { error: tagErr } = await admin.from('user_tags').insert(rows);
      if (tagErr) {
        return NextResponse.json({ error: tagErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      userId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

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

    let targetUserId = userId;

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

    // If user requested creating a fresh profile during onboarding
    if (body.createNew) {
      const slugBase = fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.|\.$/g, '')
        .slice(0, 18);
      const uniqueNum = Math.floor(1000 + Math.random() * 8999);
      const email = `${slugBase || 'believer'}.${uniqueNum}@unitebyfaith.org`;
      const displayHandle = `${(slugBase || 'believer').replace(/\./g, '_')}_${uniqueNum}`;

      const { data: createdUser, error: authErr } =
        await admin.auth.admin.createUser({
          email,
          password: 'UniteFaith2026!',
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

      if (authErr || !createdUser.user) {
        return NextResponse.json(
          { error: authErr?.message || 'Failed to provision user account' },
          { status: 500 }
        );
      }

      targetUserId = createdUser.user.id;

      const { error: insertProfErr } = await admin.from('profiles').insert({
        id: targetUserId,
        full_name: fullName,
        display_handle: displayHandle,
        avatar_url: avatarUrl,
        headline,
        bio,
        denomination_or_tradition: denomination,
        church_or_fellowship: church,
        location_city: locationCity,
        location_timezone: 'Asia/Kolkata',
        years_in_faith: yearsInFaith,
        fellowship_mode: fellowshipMode,
        onboarding_completed: true,
        is_demo_account: false,
      });

      if (insertProfErr) {
        return NextResponse.json(
          { error: insertProfErr.message },
          { status: 500 }
        );
      }
    } else {
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
        .eq('id', targetUserId);

      if (updateProfErr) {
        return NextResponse.json(
          { error: updateProfErr.message },
          { status: 500 }
        );
      }
    }

    // Replace user_tags atomically
    const selectedTags = (body.selectedTags || []) as IncomingTag[];
    await admin.from('user_tags').delete().eq('user_id', targetUserId);

    if (selectedTags.length > 0) {
      const rows = selectedTags.map((t) => ({
        user_id: targetUserId,
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
      userId: targetUserId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

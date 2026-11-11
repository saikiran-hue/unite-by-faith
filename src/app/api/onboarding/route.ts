import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { buildProfileUpdate } from '@/lib/profile-update';

const invalid = (field: string, message: string) =>
  NextResponse.json({ error: { field, message } }, { status: 400 });

/** Send what you change: only keys present in the body are written. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return invalid('body', 'Send a JSON object.');
    }
    const update = buildProfileUpdate(body);
    if ('error' in update) return invalid(update.error.field, update.error.message);

    const admin = createSupabaseAdminClient();
    const priv = update.private;

    // An age range sent with only one end must still hold against the stored other end.
    if ((priv.age_min !== undefined) !== (priv.age_max !== undefined)) {
      const { data } = await admin
        .from('profile_private')
        .select('age_min, age_max')
        .eq('user_id', userId)
        .maybeSingle();
      const min = priv.age_min ?? data?.age_min;
      const max = priv.age_max ?? data?.age_max;
      if (min != null && max != null && max < min) {
        return invalid(
          priv.age_max !== undefined ? 'ageMax' : 'ageMin',
          'Maximum age can’t be below the minimum.'
        );
      }
    }

    // Check tags before writing anything, so a bad slug changes nothing.
    let tagRows: { user_id: string; tag_slug: string; category: string; is_priority: boolean; level: number }[] | null = null;
    if (update.tags) {
      const slugs = update.tags.map((t) => t.slug);
      const active = new Map<string, string>();
      if (slugs.length > 0) {
        const { data, error } = await admin
          .from('taxonomy_tags')
          .select('slug, category')
          .in('slug', slugs)
          .eq('is_active', true);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const r of data ?? []) active.set(r.slug, r.category);
      }
      if (slugs.some((s) => !active.has(s))) return invalid('tags', 'One of those habits isn’t available.');
      tagRows = update.tags.map((t) => ({
        user_id: userId,
        tag_slug: t.slug,
        category: active.get(t.slug)!,
        is_priority: t.isPriority,
        level: t.level,
      }));
    }

    if (Object.keys(update.profile).length > 0) {
      const { error } = await admin
        .from('profiles')
        .update({ ...update.profile, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) {
        if (error.code === '23503') {
          return invalid(update.profile.location_city_id !== undefined ? 'cityId' : 'traditionId', 'Not a valid option.');
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Object.keys(priv).length > 0) {
      const { error } = await admin
        .from('profile_private')
        .upsert({ ...priv, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (tagRows) {
      await admin.from('user_tags').delete().eq('user_id', userId);
      if (tagRows.length > 0) {
        const { error } = await admin.from('user_tags').insert(tagRows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, userId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { buildProfileUpdate, CUSTOM_CLASH_MESSAGE, findCatalogueClash } from '@/lib/profile-update';
import { mapCustomLabels, planCustomRows } from '@/lib/matching/custom-map';
import { topicRowsForSave } from '@/lib/matching/personal';

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

    // Own habits: reject exact catalogue labels, then map new or changed ones before writing anything.
    let customRows: { category: string; label: string; mapped_slugs: string[] }[] | null = null;
    if (update.customTags) {
      const custom = update.customTags;
      if (custom.length > 0) {
        const { data, error } = await admin
          .from('taxonomy_tags')
          .select('label, category, is_active')
          .in('category', [...new Set(custom.map((c) => c.category))]);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (findCatalogueClash(custom, data ?? [])) return invalid('customTags', CUSTOM_CLASH_MESSAGE);
      }
      const { data: existing, error: exErr } = await admin
        .from('user_custom_tags')
        .select('category, label, mapped_slugs')
        .eq('user_id', userId);
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
      // Labels with a stored non-empty mapping keep it; new labels and empty mappings are (re)mapped.
      const plan = planCustomRows(custom, existing ?? []);
      const mapped = await mapCustomLabels(admin, plan.fresh);
      customRows = custom.map((c) => ({ category: c.category, label: c.label, mapped_slugs: plan.mappedFor(c, mapped) }));
    }

    // Personal topics: embed new labels and ones stored without an embedding, before writing anything.
    let topicRows: { label: string; embedding: string | null }[] | null = null;
    if (update.personalTopics) {
      const labels = update.personalTopics;
      const { data: embedded, error: tErr } = await admin
        .from('user_personal_topics')
        .select('label')
        .eq('user_id', userId)
        .not('embedding', 'is', null);
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
      topicRows = await topicRowsForSave(labels, (embedded ?? []).map((r) => r.label as string));
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
      const { error: delErr } = await admin.from('user_tags').delete().eq('user_id', userId);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      if (tagRows.length > 0) {
        const { error } = await admin.from('user_tags').insert(tagRows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (customRows) {
      // One transaction: a failed insert can't leave the member with none, and double submits don't collide.
      const { error } = await admin.rpc('replace_user_custom_tags', { uid: userId, rows: customRows });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (topicRows) {
      const { error } = await admin.rpc('replace_user_personal_topics', { uid: userId, rows: topicRows });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

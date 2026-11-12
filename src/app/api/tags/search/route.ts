import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { embed } from '@/lib/matching/embed';
import { normaliseQuery, pickSuggestions } from '@/lib/matching/suggest';
import { parseCategory, withCategory } from '@/lib/matching/tag-search';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const q = normaliseQuery(req.nextUrl.searchParams.get('q') ?? '');
    if (!q) return NextResponse.json({ source: 'none', tags: [] });
    const cat = parseCategory(req.nextUrl.searchParams.get('category'));
    if (cat === undefined) return NextResponse.json({ error: 'invalid_category' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: trgm, error: trgmErr } = await withCategory(admin, 'search_tags_text', { q }, cat);
    if (trgmErr) throw new Error(`search_tags_text: ${trgmErr.message}`);
    const textHits = (trgm ?? []) as { slug: string; score: number }[];

    // Only load the model when text matching found nothing good enough.
    let picked = pickSuggestions(textHits, []);
    if (picked.source === 'none') {
      try {
        const [vec] = await embed([q]);
        const { data, error } = await withCategory(
          admin,
          'search_tags_vector',
          { q: `[${Array.from(vec).join(',')}]`, k: 3 },
          cat,
        );
        if (error) throw new Error(`search_tags_vector: ${error.message}`);
        picked = pickSuggestions(textHits, (data ?? []) as { slug: string; cos: number }[]);
      } catch (e) {
        // Infrastructure failure, not missing-tag demand: do not log a tag_request.
        console.error('tags/search meaning step failed', e);
        return NextResponse.json({ source: 'none', tags: [] });
      }
    }

    if (picked.source === 'none') {
      const { error } = await admin.from('tag_requests').insert({ user_id: auth.userId, query: q });
      if (error) console.error('tag_requests insert failed', error.message);
      return NextResponse.json({ source: 'none', tags: [] });
    }

    const { data: rows, error } = await admin
      .from('taxonomy_tags')
      .select('slug, label, category, subgroup')
      .in('slug', picked.slugs);
    if (error) throw new Error(`taxonomy_tags: ${error.message}`);
    const bySlug = new Map((rows ?? []).map((r) => [r.slug as string, r]));
    // The category filter already ran in SQL; this also covers the pre-0014 fallback in withCategory.
    const tags = picked.slugs.flatMap((s) =>
      bySlug.has(s) && (!cat || bySlug.get(s)!.category === cat) ? [bySlug.get(s)!] : [],
    );
    return NextResponse.json({ source: picked.source, tags });
  } catch (e) {
    console.error('tags/search failed', e);
    return NextResponse.json({ error: 'tag_search_failed' }, { status: 500 });
  }
}

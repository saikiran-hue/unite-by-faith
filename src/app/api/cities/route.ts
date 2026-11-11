import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';

/** City picker lookup: trigram match on the name, top 8. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
    if (q.length < 2) return NextResponse.json({ cities: [] });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc('search_cities', { q });
    if (error) throw new Error(`search_cities: ${error.message}`);
    const cities = ((data ?? []) as { id: number; name: string; country_code: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
      country_code: c.country_code,
    }));
    return NextResponse.json({ cities });
  } catch (err) {
    console.error('GET /api/cities failed', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

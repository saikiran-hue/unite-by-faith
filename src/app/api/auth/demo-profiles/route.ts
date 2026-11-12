import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { devAuthEnabled } from '@/lib/dev-auth';

/** Demo accounts for the local sign-in screen. Never includes real users; 404 in production. */
export async function GET() {
  if (!devAuthEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, headline')
    .eq('is_demo_account', true)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

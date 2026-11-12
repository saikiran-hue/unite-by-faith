import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { needsAgeCheck } from '@/lib/age-gate';
import { newProfileRow } from '@/lib/new-profile';

/**
 * Google sends the user back here with a one-time `code`. Exchange it for a session (cookies),
 * give a first-time member a starting profile, then route: age check -> onboarding -> home.
 */
export async function GET(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return go('/auth?error=google');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return go('/auth?error=google');
  const user = data.user;

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();
  if (readErr) return go('/auth?error=setup');

  if (!existing) {
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const { error: insErr } = await admin
      .from('profiles')
      .insert(newProfileRow(user.id, meta.full_name ?? meta.name ?? '', meta.avatar_url ?? meta.picture));
    // 23505: a parallel callback created it first, which is fine.
    if (insErr && insErr.code !== '23505') return go('/auth?error=setup');
  }

  if (needsAgeCheck(user)) return go('/auth/age');
  return go(existing?.onboarding_completed ? '/' : '/onboarding');
}

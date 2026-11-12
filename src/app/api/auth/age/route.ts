import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkBirthDate, needsAgeCheck } from '@/lib/age-gate';
import { defaultAgeRange } from '@/lib/age';
import { resolveToday } from '../switch/modes';

/**
 * One-time age check for Google accounts. 18+: store the birth date privately and mark the
 * account verified. Under 18: sign out and delete the new account (it cascades to the profile).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const nextPath = async () => {
    const { data } = await admin.from('profiles').select('onboarding_completed').eq('id', user.id).maybeSingle();
    return data?.onboarding_completed ? '/' : '/onboarding';
  };
  if (!needsAgeCheck(user)) return NextResponse.json({ ok: true, next: await nextPath() });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 });
  }

  const birth = checkBirthDate(body.birthDate, resolveToday(body.today, new Date()));
  if (!birth.ok && !birth.underage) {
    return NextResponse.json({ error: birth.message, field: 'birthDate' }, { status: 400 });
  }
  if (!birth.ok) {
    await supabase.auth.signOut();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) console.error(`underage account delete failed for ${user.id}: ${error.message}`);
    return NextResponse.json({ error: birth.message, underage: true }, { status: 403 });
  }

  const range = defaultAgeRange(birth.age);
  const { error: privErr } = await admin.from('profile_private').upsert(
    { user_id: user.id, birth_date: birth.birthDate, age_min: range.min, age_max: range.max, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (privErr) return NextResponse.json({ error: privErr.message }, { status: 500 });

  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { age_verified: true },
  });
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
  // Re-issue the session so the cookie's token carries the new claim.
  await supabase.auth.refreshSession();

  return NextResponse.json({ ok: true, next: await nextPath() });
}

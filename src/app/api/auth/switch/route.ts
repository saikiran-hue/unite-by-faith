import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { defaultAgeRange, ageOn } from '@/lib/age';
import { resolveToday, validateSignup } from './modes';
import { devAuthEnabled } from '@/lib/dev-auth';
import { newProfileRow } from '@/lib/new-profile';

function fail(status: number, error: string, field?: string) {
  return NextResponse.json(field ? { error, field } : { error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();

    async function onboardingDone(userId: string) {
      const { data } = await admin
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .single();
      return Boolean(data?.onboarding_completed);
    }

    // Sign out: clears the Supabase session cookies.
    if (body.mode === 'signout') {
      await supabase.auth.signOut();
      return NextResponse.json({ ok: true });
    }

    // Everything below is local development only; production is Google sign-in.
    if (!devAuthEnabled()) return fail(404, 'Not found');

    // Demo accounts only: sign in as a seeded demo profile.
    if (body.mode === 'demo') {
      const userId = typeof body.userId === 'string' ? body.userId : '';
      const password = process.env.DEMO_ACCOUNT_PASSWORD;
      if (!userId) return fail(400, 'Choose a demo member.');
      if (!password) return fail(500, 'Demo sign-in is not configured.');

      const { data: profile } = await admin
        .from('profiles')
        .select('id, is_demo_account')
        .eq('id', userId)
        .maybeSingle();
      if (!profile) return fail(404, 'Demo member not found');
      if (!profile.is_demo_account) return fail(403, 'Not a demo account');

      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = authUser.user?.email;
      if (!email) return fail(404, 'Demo member not found');

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) return fail(401, 'Could not sign in as that demo member');
      return NextResponse.json({
        userId: data.user.id,
        onboardingCompleted: await onboardingDone(data.user.id),
      });
    }

    // Sign in with email and password.
    if (body.mode === 'signin') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return fail(401, error?.message || 'Invalid credentials');
      }
      return NextResponse.json({
        userId: data.user.id,
        onboardingCompleted: await onboardingDone(data.user.id),
      });
    }

    // Sign up a new believer (18 or older).
    if (body.mode === 'signup') {
      const today = resolveToday(body.today, new Date());
      const checked = validateSignup(body, today);
      if (!checked.ok) return fail(400, checked.message, checked.field);
      const { fullName, email, password, birthDate } = checked.value;

      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createErr || !createdAuth.user) {
        const taken =
          createErr?.code === 'email_exists' || /already/i.test(createErr?.message ?? '');
        return taken
          ? fail(409, 'An account with this email already exists. Sign in instead.', 'email')
          : fail(400, createErr?.message || 'Could not create user account');
      }

      const newUserId = createdAuth.user.id;
      const range = defaultAgeRange(ageOn(birthDate, today));

      let setupError: string | null = null;
      try {
        const { error: profErr } = await admin.from('profiles').upsert(newProfileRow(newUserId, fullName));
        const { error: privErr } = profErr
          ? { error: null }
          : await admin.from('profile_private').insert({
              user_id: newUserId,
              birth_date: birthDate,
              age_min: range.min,
              age_max: range.max,
            });
        setupError = profErr?.message ?? privErr?.message ?? null;
      } catch (e) {
        setupError = e instanceof Error ? e.message : 'Could not finish creating the account';
      }

      if (setupError) {
        // Leave nothing half-created: the cascade removes the profile rows.
        const { error: delErr } = await admin.auth.admin.deleteUser(newUserId);
        if (delErr) {
          console.error(`signup cleanup failed for ${newUserId}: ${delErr.message}`);
        }
        return fail(500, setupError);
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) return fail(500, signInErr.message);

      return NextResponse.json({ userId: newUserId, onboardingCompleted: false });
    }

    return fail(400, 'Invalid auth action request');
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : 'Unexpected server error');
  }
}

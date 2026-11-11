import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const AVATAR_POOL = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createSupabaseAdminClient();

    // 1. Direct believer switch by userId
    if (body.userId) {
      const { data: profile, error } = await admin
        .from('profiles')
        .select('*')
        .eq('id', body.userId)
        .single();

      if (error || !profile) {
        return NextResponse.json(
          { error: 'Believer profile not found' },
          { status: 404 }
        );
      }


      return NextResponse.json({
        userId: profile.id,
        onboardingCompleted: profile.onboarding_completed,
      });
    }

    // 2. Sign In with Email & Password
    if (body.mode === 'signin') {
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = String(body.password || '');

      const { data: signInData, error: signInErr } =
        await admin.auth.signInWithPassword({
          email,
          password,
        });

      if (signInErr || !signInData.user) {
        return NextResponse.json(
          { error: signInErr?.message || 'Invalid credentials' },
          { status: 401 }
        );
      }


      const { data: profile } = await admin
        .from('profiles')
        .select('*')
        .eq('id', signInData.user.id)
        .single();

      return NextResponse.json({
        userId: signInData.user.id,
        onboardingCompleted: Boolean(profile?.onboarding_completed),
      });
    }

    // 3. Sign Up new believer account
    if (body.mode === 'signup') {
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      const password = String(body.password || 'UniteFaith2026!');
      const fullName = String(body.fullName || 'New Believer').trim();

      if (!email || !fullName) {
        return NextResponse.json(
          { error: 'Full name and email are required' },
          { status: 400 }
        );
      }

      const handleBase = fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 18);
      const displayHandle = `${handleBase || 'believer'}_${Math.floor(100 + Math.random() * 899)}`;

      const { data: createdAuth, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

      if (createErr || !createdAuth.user) {
        return NextResponse.json(
          { error: createErr?.message || 'Could not create user account' },
          { status: 400 }
        );
      }

      const newUserId = createdAuth.user.id;
      const randomAvatar =
        AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)];

      const { error: profErr } = await admin.from('profiles').upsert({
        id: newUserId,
        full_name: fullName,
        display_handle: displayHandle,
        avatar_url: randomAvatar,
        headline: 'Christian Friend & Community Builder',
        bio: 'Excited to connect in 3–4 member fellowship pods and 1v1 matches!',
        denomination_or_tradition: 'Non-Denominational',
        church_or_fellowship: '',
        location_city: 'Bengaluru, IN',
        location_timezone: 'Asia/Kolkata',
        years_in_faith: 'Growing Believer',
        fellowship_mode: 'both',
        onboarding_completed: false,
        is_demo_account: false,
      });

      if (profErr) {
        return NextResponse.json({ error: profErr.message }, { status: 500 });
      }


      return NextResponse.json({
        userId: newUserId,
        onboardingCompleted: false,
      });
    }

    return NextResponse.json(
      { error: 'Invalid auth action request' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

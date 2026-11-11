import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { UserProfile, UserTag } from '@/types/database';

/** The verified Supabase Auth session user id, or null when signed out. */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Resolves the signed-in user id, or a 401 `signed_out` response to return. */
export async function requireUserId(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const userId = await getSessionUserId();
  if (!userId) {
    return {
      response: NextResponse.json({ error: 'signed_out' }, { status: 401 }),
    };
  }
  return { userId };
}

export async function getHydratedProfile(
  userId: string
): Promise<UserProfile | null> {
  const admin = createSupabaseAdminClient();

  const { data: profile, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return null;
  }

  const { data: tags } = await admin
    .from('user_tags')
    .select('*')
    .eq('user_id', userId);

  return {
    ...profile,
    tags: (tags || []) as UserTag[],
  } as UserProfile;
}

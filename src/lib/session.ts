import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { UserProfile, UserTag } from '@/types/database';

export const ACTIVE_USER_COOKIE = 'ubf_active_user_id';
export const DEFAULT_SEED_USER_ID = '11111111-1111-4111-8111-111111111101';

export async function getActiveUserId(): Promise<string> {
  const cookieStore = await cookies();
  const overrideId = cookieStore.get(ACTIVE_USER_COOKIE)?.value;
  if (overrideId) {
    return overrideId;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      return user.id;
    }
  } catch {
    // Fallback to default seed believer if unauthenticated
  }

  return DEFAULT_SEED_USER_ID;
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

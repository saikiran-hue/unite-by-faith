import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { computeDuoMatches, scoreAndRankPods } from '@/lib/matching/engine';
import {
  CurrentUser,
  PodMemberProfile,
  ProfilePrivate,
  TaxonomyTag,
  Tradition,
  UserProfile,
  UserTag,
} from '@/types/database';

// Explicit columns: never select the 384-d embedding.
const TAXONOMY_COLUMNS =
  'slug, label, category, description, icon_name, sort_order, subgroup, synonyms, popularity, is_active';

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const [
      { data: taxonomyRows, error: taxError },
      { data: profileRows, error: profError },
      { data: userTagRows, error: tagError },
      { data: podRows, error: podError },
      { data: podMemberRows, error: pmError },
      { data: duoRows, error: duoError },
      { data: privateRow, error: privError },
      { data: traditionRows, error: tradError },
    ] = await Promise.all([
      admin
        .from('taxonomy_tags')
        .select(TAXONOMY_COLUMNS)
        .order('sort_order', { ascending: true }),
      admin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true }),
      admin.from('user_tags').select('*'),
      admin.from('pods').select('*').order('created_at', { ascending: true }),
      admin
        .from('pod_members')
        .select('*')
        .order('joined_at', { ascending: true }),
      admin.from('duo_matches').select('*'),
      admin
        .from('profile_private')
        .select(
          'user_id, birth_date, gender, age_min, age_max, max_distance_km, only_my_tradition'
        )
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('traditions').select('id, name, family, sort_order').order('sort_order', { ascending: true }),
    ]);

    if (taxError || profError || tagError || podError || pmError || duoError || privError || tradError) {
      return NextResponse.json(
        {
          error:
            taxError?.message ||
            profError?.message ||
            tagError?.message ||
            podError?.message ||
            pmError?.message ||
            duoError?.message ||
            privError?.message ||
            tradError?.message,
        },
        { status: 500 }
      );
    }

    const taxonomyTags = (taxonomyRows || []) as TaxonomyTag[];

    const tagsByUser = new Map<string, UserTag[]>();
    for (const ut of (userTagRows || []) as UserTag[]) {
      const list = tagsByUser.get(ut.user_id) || [];
      list.push(ut);
      tagsByUser.set(ut.user_id, list);
    }

    const allProfiles: UserProfile[] = (profileRows || []).map((p) => ({
      ...p,
      tags: tagsByUser.get(p.id) || [],
    }));

    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

    const profile = profileMap.get(userId);

    if (!profile) {
      return NextResponse.json(
        { error: 'No profile found for this account' },
        { status: 404 }
      );
    }

    const currentUser: CurrentUser = {
      ...profile,
      private: (privateRow as ProfilePrivate | null) ?? null,
    };

    let city: { id: number; name: string; country_code: string } | null = null;
    if (profile.location_city_id) {
      const { data: cityRow, error: cityError } = await admin
        .from('cities')
        .select('id, name, country_code')
        .eq('id', profile.location_city_id)
        .maybeSingle();
      if (cityError) return NextResponse.json({ error: cityError.message }, { status: 500 });
      city = cityRow;
    }

    // Hydrate pod members
    const membersByPod = new Map<string, PodMemberProfile[]>();
    for (const pm of podMemberRows || []) {
      const memberProfile = profileMap.get(pm.user_id);
      if (!memberProfile) continue;
      const list = membersByPod.get(pm.pod_id) || [];
      list.push({
        pod_id: pm.pod_id,
        user_id: pm.user_id,
        role: pm.role,
        joined_at: pm.joined_at,
        profile: memberProfile,
      });
      membersByPod.set(pm.pod_id, list);
    }

    const hydratedPods = (podRows || []).map((pod) => ({
      ...pod,
      members: membersByPod.get(pod.id) || [],
    }));

    // Map existing 1v1 chat rooms for currentUser
    const existingDuoRoomsByPartnerId = new Map<string, string>();
    const duoChats: { partner: UserProfile; chat_room_id: string }[] = [];
    for (const dm of duoRows || []) {
      if (!dm.chat_room_id) continue;
      if (dm.user_a_id === currentUser.id) {
        existingDuoRoomsByPartnerId.set(dm.user_b_id, dm.chat_room_id);
      } else if (dm.user_b_id === currentUser.id) {
        existingDuoRoomsByPartnerId.set(dm.user_a_id, dm.chat_room_id);
      }
    }
    for (const [partnerId, chat_room_id] of existingDuoRoomsByPartnerId) {
      const partner = profileMap.get(partnerId);
      if (partner) duoChats.push({ partner, chat_room_id });
    }

    const rankedPods = scoreAndRankPods(
      currentUser,
      hydratedPods,
      taxonomyTags
    );
    const duoMatches = computeDuoMatches(
      currentUser,
      allProfiles,
      taxonomyTags,
      existingDuoRoomsByPartnerId
    );

    return NextResponse.json({
      currentUser,
      taxonomyTags,
      traditions: (traditionRows || []) as Tradition[],
      city,
      pods: rankedPods,
      duoMatches,
      duoChats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { PUBLIC_CARD_COLUMNS, TAXONOMY_COLUMNS } from '@/lib/taxonomy';
import {
  CurrentUser,
  CustomTag,
  PodMemberProfile,
  ProfilePrivate,
  TaxonomyTag,
  Tradition,
  UserProfile,
  UserTag,
} from '@/types/database';

// Only the card fields the home page renders for other people.
type PublicCard = Pick<UserProfile, 'id' | 'full_name' | 'display_handle' | 'avatar_url' | 'headline'>;

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    // Everything is scoped to the viewer: whole-table reads hit the 1000-row cap and truncate silently.
    const [
      { data: taxonomyRows, error: taxError },
      { data: profileRow, error: profError },
      { data: userTagRows, error: tagError },
      { data: mySeats, error: seatError },
      { data: duoRows, error: duoError },
      { data: privateRow, error: privError },
      { data: traditionRows, error: tradError },
      { data: customRows, error: customError },
    ] = await Promise.all([
      admin
        .from('taxonomy_tags')
        .select(TAXONOMY_COLUMNS)
        .order('sort_order', { ascending: true }),
      admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
      admin.from('user_tags').select('*').eq('user_id', userId),
      admin.from('pod_members').select('pod_id').eq('user_id', userId),
      admin
        .from('duo_matches')
        .select('user_a_id, user_b_id, chat_room_id')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`),
      admin
        .from('profile_private')
        .select(
          'user_id, birth_date, gender, age_min, age_max, max_distance_km, only_my_tradition'
        )
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('traditions').select('id, name, family, sort_order').order('sort_order', { ascending: true }),
      admin
        .from('user_custom_tags')
        .select('id, category, label, mapped_slugs')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('label', { ascending: true }),
    ]);
    // Own habits are optional extras: a failed read (e.g. before migration 0014) shows none rather than failing the page.
    if (customError) console.error('user_custom_tags read failed', customError.message);

    const firstError =
      taxError || profError || tagError || seatError || duoError || privError || tradError;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const taxonomyTags = (taxonomyRows || []) as TaxonomyTag[];

    if (!profileRow) {
      return NextResponse.json(
        { error: 'No profile found for this account' },
        { status: 404 }
      );
    }
    const profile: UserProfile = { ...profileRow, tags: (userTagRows || []) as UserTag[] };

    const labelOf = new Map(taxonomyTags.map((t) => [t.slug, t.label]));
    const customTags: CustomTag[] = ((customError ? [] : customRows) ?? []).map((r) => ({
      id: r.id as string,
      category: r.category as CustomTag['category'],
      label: r.label as string,
      mapped: ((r.mapped_slugs ?? []) as string[]).flatMap((slug) =>
        labelOf.has(slug) ? [{ slug, label: labelOf.get(slug)! }] : []
      ),
    }));
    const currentUser: CurrentUser = {
      ...profile,
      private: (privateRow as ProfilePrivate | null) ?? null,
      customTags,
      customTagsLoaded: !customError,
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

    // The viewer's pods and their members.
    const myPodIds = (mySeats || []).map((m) => m.pod_id as string);
    let podRows: Record<string, unknown>[] = [];
    let podMemberRows: Omit<PodMemberProfile, 'profile'>[] = [];
    if (myPodIds.length > 0) {
      const [{ data: pRows, error: pErr }, { data: pmRows, error: pmErr }] = await Promise.all([
        admin.from('pods').select('*').in('id', myPodIds).order('created_at', { ascending: true }),
        admin
          .from('pod_members')
          .select('pod_id, user_id, role, joined_at')
          .in('pod_id', myPodIds)
          .order('joined_at', { ascending: true }),
      ]);
      if (pErr || pmErr) {
        return NextResponse.json({ error: (pErr || pmErr)!.message }, { status: 500 });
      }
      podRows = pRows || [];
      podMemberRows = pmRows || [];
    }

    // 1v1 partners by id
    const existingDuoRoomsByPartnerId = new Map<string, string>();
    for (const dm of duoRows || []) {
      if (!dm.chat_room_id) continue;
      existingDuoRoomsByPartnerId.set(
        dm.user_a_id === userId ? dm.user_b_id : dm.user_a_id,
        dm.chat_room_id
      );
    }

    // Public cards for pod members and 1v1 partners only.
    const cardIds = [
      ...new Set([...podMemberRows.map((m) => m.user_id), ...existingDuoRoomsByPartnerId.keys()]),
    ];
    const cardMap = new Map<string, PublicCard>();
    if (cardIds.length > 0) {
      const { data: cards, error: cardError } = await admin
        .from('profiles')
        .select(PUBLIC_CARD_COLUMNS)
        .in('id', cardIds);
      if (cardError) return NextResponse.json({ error: cardError.message }, { status: 500 });
      for (const c of (cards || []) as PublicCard[]) cardMap.set(c.id, c);
    }

    // Hydrate pod members
    const membersByPod = new Map<string, (Omit<PodMemberProfile, 'profile'> & { profile: PublicCard })[]>();
    for (const pm of podMemberRows) {
      const card = cardMap.get(pm.user_id);
      if (!card) continue;
      const list = membersByPod.get(pm.pod_id) || [];
      list.push({
        pod_id: pm.pod_id,
        user_id: pm.user_id,
        role: pm.role,
        joined_at: pm.joined_at,
        profile: card,
      });
      membersByPod.set(pm.pod_id, list);
    }

    const duoChats: { partner: PublicCard; chat_room_id: string }[] = [];
    for (const [partnerId, chat_room_id] of existingDuoRoomsByPartnerId) {
      const partner = cardMap.get(partnerId);
      if (partner) duoChats.push({ partner, chat_room_id });
    }

    // The viewer's own pods, for the Group Chats list.
    const joinedPods = podRows.map((pod) => ({
      ...pod,
      members: membersByPod.get(pod.id as string) || [],
      is_joined: true,
    }));

    return NextResponse.json({
      currentUser,
      taxonomyTags,
      traditions: (traditionRows || []) as Tradition[],
      city,
      joinedPods,
      duoChats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

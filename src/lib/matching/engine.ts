import {
  ComputedDuoMatch,
  FellowshipPod,
  PillarBreakdown,
  PillarCategory,
  TaxonomyTag,
  UserProfile,
} from '@/types/database';

// Faith is the core of every match. Work & skills is one interest among
// hobbies and tastes, never the main driver.
export const PILLAR_WEIGHTS: Record<PillarCategory, number> = {
  faith: 0.4,
  hobbies: 0.25,
  tastes: 0.2,
  skills: 0.15,
};

export function formatTagLabel(
  slug: string,
  tagMap?: Map<string, TaxonomyTag>
): string {
  const found = tagMap?.get(slug);
  if (found) return found.label;
  return slug
    .split('-')
    .map((w) =>
      w === 'ai' || w === 'ml' || w === '1v1'
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

function computePillarOverlap(
  userSlugs: string[],
  partnerSlugs: string[]
): { score: number; shared: string[] } {
  const partnerSet = new Set(partnerSlugs);
  const shared = userSlugs.filter((s) => partnerSet.has(s));

  if (userSlugs.length === 0 || partnerSlugs.length === 0) {
    return { score: 45, shared: [] };
  }

  // Softened Sorensen-Dice + Minimum-Overlap coefficient for realistic human affinity scores
  const minLen = Math.max(1, Math.min(userSlugs.length, partnerSlugs.length));
  const overlapRatio = shared.length / minLen;
  const rawScore =
    shared.length === 0
      ? 35
      : Math.min(100, Math.round(58 + overlapRatio * 42));

  return { score: rawScore, shared };
}

export function computeDuoMatches(
  currentUser: UserProfile,
  allProfiles: UserProfile[],
  taxonomyTags: TaxonomyTag[],
  existingDuoRoomsByPartnerId: Map<string, string> = new Map()
): ComputedDuoMatch[] {
  const tagMap = new Map(taxonomyTags.map((t) => [t.slug, t]));

  const userByCategory: Record<PillarCategory, string[]> = {
    faith: [],
    skills: [],
    hobbies: [],
    tastes: [],
  };

  const userPriorities = new Set<string>();
  for (const t of currentUser.tags || []) {
    userByCategory[t.category]?.push(t.tag_slug);
    if (t.is_priority) userPriorities.add(t.tag_slug);
  }

  const results: ComputedDuoMatch[] = [];

  for (const partner of allProfiles) {
    if (partner.id === currentUser.id) continue;

    const partnerByCategory: Record<PillarCategory, string[]> = {
      faith: [],
      skills: [],
      hobbies: [],
      tastes: [],
    };
    const partnerPriorities = new Set<string>();

    for (const t of partner.tags || []) {
      partnerByCategory[t.category]?.push(t.tag_slug);
      if (t.is_priority) partnerPriorities.add(t.tag_slug);
    }

    const breakdown: PillarBreakdown = {
      faith: computePillarOverlap(userByCategory.faith, partnerByCategory.faith),
      skills: computePillarOverlap(
        userByCategory.skills,
        partnerByCategory.skills
      ),
      hobbies: computePillarOverlap(
        userByCategory.hobbies,
        partnerByCategory.hobbies
      ),
      tastes: computePillarOverlap(
        userByCategory.tastes,
        partnerByCategory.tastes
      ),
    };

    // Faith first, then hobbies and tastes; work & skills last.
    const sharedTags = [
      ...breakdown.faith.shared,
      ...breakdown.hobbies.shared,
      ...breakdown.tastes.shared,
      ...breakdown.skills.shared,
    ];

    const priorityHits = sharedTags.filter(
      (slug) => userPriorities.has(slug) || partnerPriorities.has(slug)
    );

    const weightedBase =
      breakdown.faith.score * PILLAR_WEIGHTS.faith +
      breakdown.skills.score * PILLAR_WEIGHTS.skills +
      breakdown.hobbies.score * PILLAR_WEIGHTS.hobbies +
      breakdown.tastes.score * PILLAR_WEIGHTS.tastes;

    const priorityBonus = Math.min(14, priorityHits.length * 4.5);
    const totalSharedBonus = Math.min(10, sharedTags.length * 2);

    const similarityScore = Math.min(
      99,
      Math.max(52, Math.round(weightedBase + priorityBonus + totalSharedBonus))
    );

    const topSharedLabels = sharedTags
      .slice(0, 3)
      .map((s) => formatTagLabel(s, tagMap));

    const matchHeadline =
      topSharedLabels.length >= 2
        ? `You both share ${topSharedLabels.slice(0, -1).join(', ')} & ${topSharedLabels[topSharedLabels.length - 1]}`
        : topSharedLabels.length === 1
          ? `You both share ${topSharedLabels[0]} and a love for Christian fellowship`
          : `Complementary faith rhythms and a heart to grow together`;

    const suggestedIcebreaker =
      topSharedLabels.length > 0
        ? `Hey ${partner.full_name.split(' ')[0]}! We matched on ${topSharedLabels.join(' & ')}. How did you get into that, and how has your walk with God been lately?`
        : `Hey ${partner.full_name.split(' ')[0]}! Loved reading your profile—how has God been working in your life this season?`;

    results.push({
      partner,
      similarity_score: similarityScore,
      shared_tags: sharedTags,
      priority_hits: priorityHits,
      pillar_breakdown: breakdown,
      match_headline: matchHeadline,
      suggested_icebreaker: suggestedIcebreaker,
      existing_chat_room_id: existingDuoRoomsByPartnerId.get(partner.id) || null,
    });
  }

  return results.sort((a, b) => b.similarity_score - a.similarity_score);
}

export function scoreAndRankPods(
  currentUser: UserProfile,
  pods: Omit<
    FellowshipPod,
    'affinity_score' | 'overlapping_tags' | 'is_joined'
  >[],
  taxonomyTags: TaxonomyTag[]
): FellowshipPod[] {
  const userTagSet = new Set((currentUser.tags || []).map((t) => t.tag_slug));
  const userPriorities = new Set(
    (currentUser.tags || []).filter((t) => t.is_priority).map((t) => t.tag_slug)
  );
  const validSlugs = new Set(taxonomyTags.map((t) => t.slug));

  return pods
    .map((pod) => {
      const isJoined = pod.members.some((m) => m.user_id === currentUser.id);

      // Collect pod's anchor tags + member tags for deep cluster matching
      const podTagPool = new Set<string>(
        (pod.anchor_tags || []).filter((s) => validSlugs.has(s) || s.length > 0)
      );
      for (const m of pod.members) {
        for (const t of m.profile?.tags || []) {
          podTagPool.add(t.tag_slug);
        }
      }

      const overlappingAnchor = (pod.anchor_tags || []).filter((slug) =>
        userTagSet.has(slug)
      );
      const overlappingPool = Array.from(podTagPool).filter((slug) =>
        userTagSet.has(slug)
      );

      const combinedOverlap = Array.from(
        new Set([...overlappingAnchor, ...overlappingPool])
      );

      const priorityHits = combinedOverlap.filter((s) =>
        userPriorities.has(s)
      ).length;

      const anchorRatio =
        pod.anchor_tags.length > 0
          ? overlappingAnchor.length / pod.anchor_tags.length
          : 0.5;

      const seatAvailabilityBonus =
        pod.member_count < pod.max_members && pod.member_count >= 2 ? 6 : 0;

      const rawAffinity = Math.round(
        64 +
          anchorRatio * 24 +
          Math.min(10, combinedOverlap.length * 2.5) +
          priorityHits * 3 +
          seatAvailabilityBonus
      );

      const affinityScore = Math.min(99, Math.max(60, rawAffinity));

      return {
        ...pod,
        affinity_score: affinityScore,
        overlapping_tags:
          combinedOverlap.length > 0
            ? combinedOverlap.slice(0, 5)
            : pod.anchor_tags.slice(0, 4),
        is_joined: isJoined,
      };
    })
    .sort((a, b) => {
      if (a.is_joined !== b.is_joined) return a.is_joined ? -1 : 1;
      return b.affinity_score - a.affinity_score;
    });
}

export function buildContextualIcebreakers(
  sharedTags: string[],
  roomType: 'pod_group' | 'duo_1v1',
  taxonomyTags: TaxonomyTag[]
): { category: string; title: string; prompt: string }[] {
  const tagMap = new Map(taxonomyTags.map((t) => [t.slug, t]));
  const labels = sharedTags.map((s) => formatTagLabel(s, tagMap));
  const primaryLabel = labels[0] || 'Faith & Fellowship';
  const secondaryLabel = labels[1] || 'Everyday Life';
  const tertiaryLabel = labels[2] || 'Daily Rhythms';

  if (roomType === 'duo_1v1') {
    return [
      {
        category: 'Faith & Calling',
        title: `Faith + ${primaryLabel}`,
        prompt: `How has your walk with Christ shaped the way you approach ${primaryLabel}? Is there a scripture or spiritual habit that anchors your week?`,
      },
      {
        category: 'Shared Interests',
        title: `We Both Love ${secondaryLabel}`,
        prompt: `We both picked ${secondaryLabel}! How did you get into it, and what do you enjoy most about it?`,
      },
      {
        category: 'Hobbies & Tastes',
        title: `${tertiaryLabel} & Weekend Reset`,
        prompt: `Outside of work and study, how do you enjoy ${tertiaryLabel}? What does an ideal restful weekend look like for you?`,
      },
    ];
  }

  return [
    {
      category: '3–4 Circle Intro',
      title: `Meet the Circle: ${primaryLabel} & ${secondaryLabel}`,
      prompt: `Welcome to our pod! Share a short intro: who you are, what drew you to ${primaryLabel} or ${secondaryLabel}, and one prayer request for this month.`,
    },
    {
      category: 'Faith & Life',
      title: 'Where Is God Moving?',
      prompt: `Where have you seen God at work this week — in ${primaryLabel}, ${secondaryLabel}, or everyday life? Share one moment of gratitude.`,
    },
    {
      category: 'Weekly Accountability',
      title: `${tertiaryLabel} & Weekly Goal Check-In`,
      prompt: `Let's set a micro-goal for this week! Share 1 spiritual rhythm and 1 personal goal around ${tertiaryLabel} we can cheer you on for by Sunday.`,
    },
  ];
}

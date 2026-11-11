import { TaxonomyTag } from '@/types/database';

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

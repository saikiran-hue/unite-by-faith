import { BookOpen, Code, Coffee, Guitar, type LucideIcon } from 'lucide-react';
import { PillarCategory, TaxonomyTag } from '@/types/database';
import { PILLAR_WEIGHTS } from '@/lib/matching/pillar-weights';

export interface PillarMeta {
  key: PillarCategory;
  label: string;
  /** Short description of what the pillar covers */
  blurb: string;
  icon: LucideIcon;
  /** Matching weight as a whole percentage, derived from the engine */
  weight: number;
  /** CSS variable for the pillar fill (icons, dots) */
  fill: string;
  /** Static tag class (tint background + AA text) */
  tagClass: string;
  /** Text colour class (AA on white) */
  textClass: string;
  /** Tint background class */
  tintClass: string;
}

const pct = (k: PillarCategory) => Math.round(PILLAR_WEIGHTS[k] * 100);

/** Ordered by importance: faith is the core, tech & skills is one interest among others. */
export const PILLARS: PillarMeta[] = [
  {
    key: 'faith',
    label: 'Faith Rhythms',
    blurb: 'Bible study, prayer, worship',
    icon: BookOpen,
    weight: pct('faith'),
    fill: 'var(--color-faith)',
    tagClass: 'tag-faith',
    textClass: 'text-faith-text',
    tintClass: 'bg-faith-tint',
  },
  {
    key: 'hobbies',
    label: 'Hobbies',
    blurb: 'Music, sport, outdoors, games',
    icon: Guitar,
    weight: pct('hobbies'),
    fill: 'var(--color-hobbies)',
    tagClass: 'tag-hobbies',
    textClass: 'text-hobbies-text',
    tintClass: 'bg-hobbies-tint',
  },
  {
    key: 'tastes',
    label: 'Tastes',
    blurb: 'Coffee, books, films, music',
    icon: Coffee,
    weight: pct('tastes'),
    fill: 'var(--color-tastes)',
    tagClass: 'tag-tastes',
    textClass: 'text-tastes-text',
    tintClass: 'bg-tastes-tint',
  },
  {
    key: 'skills',
    label: 'Tech & Skills',
    blurb: 'Work, study, what you build',
    icon: Code,
    weight: pct('skills'),
    fill: 'var(--color-skills)',
    tagClass: 'tag-skills',
    textClass: 'text-skills-text',
    tintClass: 'bg-skills-tint',
  },
];

export const PILLAR_BY_KEY = Object.fromEntries(
  PILLARS.map((p) => [p.key, p])
) as Record<PillarCategory, PillarMeta>;

/** Tag class for a taxonomy slug, coloured by its pillar. */
export function tagClassFor(
  slug: string,
  tagMap: Map<string, TaxonomyTag>
): string {
  const category = tagMap.get(slug)?.category;
  return category ? PILLAR_BY_KEY[category].tagClass : 'tag';
}

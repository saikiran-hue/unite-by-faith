import type { PillarCategory } from '@/types/database';
import type { IconName } from '@/components/ubf/icon-paths';
import { PILLAR_WEIGHTS } from '@/lib/matching/engine';

/** The four habit categories, faith first. Weights come from the matching engine. */
export interface Cat {
  key: PillarCategory;
  name: string;
  short: string;
  icon: IconName;
  weight: number;
  order: number;
}

export const CATS: Cat[] = (
  [
    { key: 'faith', name: 'Faith Rhythms', short: 'Faith', icon: 'cross' },
    { key: 'hobbies', name: 'Hobbies', short: 'Hobbies', icon: 'mountain' },
    { key: 'tastes', name: 'Tastes', short: 'Tastes', icon: 'coffee' },
    { key: 'skills', name: 'Tech & Skills', short: 'Tech & Skills', icon: 'code' },
  ] as const
).map((c, order) => ({ ...c, weight: Math.round(PILLAR_WEIGHTS[c.key] * 100), order }));

export const CAT_BY_KEY = Object.fromEntries(CATS.map((c) => [c.key, c])) as Record<PillarCategory, Cat>;

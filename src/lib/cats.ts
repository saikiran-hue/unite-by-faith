import type { PillarCategory } from '@/types/database';
import type { IconName } from '@/components/ubf/icon-paths';
import { categoryShare } from '@/lib/matching/pillar-weights';

/** The four habit categories, faith first. `weight` is the engine share the category feeds (Faith 40, Interests 35). */
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
).map((c, order) => ({ ...c, weight: categoryShare(c.key), order }));

export const CAT_BY_KEY = Object.fromEntries(CATS.map((c) => [c.key, c])) as Record<PillarCategory, Cat>;

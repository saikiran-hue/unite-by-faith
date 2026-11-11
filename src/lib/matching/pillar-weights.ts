import type { PillarCategory } from '@/types/database';

// The engine's top-level split (match_weights v1 "total"): Faith 40%, Interests 35%, Life fit 25%.
// Hobbies, tastes and tech & skills share the Interests part; the UI does not split it further.
export const MATCH_SPLIT = { faith: 40, interests: 35, lifeFit: 25 } as const;

/** The share of a match a habit category feeds into, as a whole percentage. */
export function categoryShare(k: PillarCategory): number {
  return k === 'faith' ? MATCH_SPLIT.faith : MATCH_SPLIT.interests;
}

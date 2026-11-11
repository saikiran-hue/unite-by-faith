import type { PillarCategory } from '@/types/database';

// Faith is the core of every match. Work & skills is one interest among
// hobbies and tastes, never the main driver.
export const PILLAR_WEIGHTS: Record<PillarCategory, number> = {
  faith: 0.4,
  hobbies: 0.25,
  tastes: 0.2,
  skills: 0.15,
};

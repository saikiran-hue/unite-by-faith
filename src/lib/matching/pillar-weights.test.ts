import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryShare, MATCH_SPLIT } from './pillar-weights';

describe('MATCH_SPLIT', () => {
  it('matches the seeded match_weights v1 total split', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/0006_matching_schema.sql'), 'utf8');
    const m = sql.match(/"total":\{"faith":([\d.]+),"interests":([\d.]+),"life":([\d.]+)\}/);
    expect(m).not.toBeNull();
    expect([MATCH_SPLIT.faith, MATCH_SPLIT.interests, MATCH_SPLIT.lifeFit]).toEqual(
      m!.slice(1).map((x) => Math.round(Number(x) * 100)),
    );
  });

  it('interest categories share the Interests part', () => {
    expect(categoryShare('faith')).toBe(40);
    expect(['hobbies', 'tastes', 'skills'].map((k) => categoryShare(k as 'hobbies'))).toEqual([35, 35, 35]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapCustomLabels, pickMapped, planCustomRows } from './custom-map';
import { CUSTOM_MAP_MIN } from './suggest';

describe('pickMapped', () => {
  const categoryOf = new Map([
    ['plants-at-home', 'tastes'],
    ['gardening', 'hobbies'],
    ['hiking', 'hobbies'],
    ['running', 'hobbies'],
  ]);
  it('keeps up to 2 same-category hits at or above the floor, best first', () => {
    const hits = [
      { slug: 'plants-at-home', cos: 0.95 },
      { slug: 'gardening', cos: 0.93 },
      { slug: 'hiking', cos: 0.9 },
      { slug: 'running', cos: 0.89 },
    ];
    expect(pickMapped(hits, categoryOf, 'hobbies', 0.87)).toEqual(['gardening', 'hiking']);
  });
  it('maps to nothing when no same-category hit reaches the floor', () => {
    expect(pickMapped([{ slug: 'gardening', cos: 0.86 }], categoryOf, 'hobbies', 0.87)).toEqual([]);
    expect(pickMapped([{ slug: 'plants-at-home', cos: 0.99 }], categoryOf, 'hobbies', 0.87)).toEqual([]);
  });
  it('skips slugs that are not active catalogue habits', () => {
    expect(pickMapped([{ slug: 'retired', cos: 0.99 }], categoryOf, 'hobbies')).toEqual([]);
  });
  it('defaults to CUSTOM_MAP_MIN, which sits at or above the did-you-mean floor', () => {
    expect(pickMapped([{ slug: 'gardening', cos: CUSTOM_MAP_MIN }], categoryOf, 'hobbies')).toEqual(['gardening']);
    expect(CUSTOM_MAP_MIN).toBeGreaterThanOrEqual(0.85);
  });
});

describe('planCustomRows', () => {
  const custom = [
    { category: 'hobbies' as const, label: 'Mountain Trekking' },
    { category: 'hobbies' as const, label: 'Bonsai Trees' },
    { category: 'faith' as const, label: 'Hymn Singing' },
  ];
  const existing = [
    { category: 'hobbies', label: 'mountain trekking', mapped_slugs: ['hiking'] },
    { category: 'hobbies', label: 'Bonsai Trees', mapped_slugs: [] },
  ];
  it('reuses non-empty stored mappings and re-maps empty ones and new labels', () => {
    const plan = planCustomRows(custom, existing);
    expect(plan.fresh.map((c) => c.label)).toEqual(['Bonsai Trees', 'Hymn Singing']);
    const freshMapped = [[], ['congregational-singing']];
    expect(custom.map((c) => plan.mappedFor(c, freshMapped))).toEqual([['hiking'], [], ['congregational-singing']]);
  });
  it('maps nothing new when every stored mapping is non-empty', () => {
    expect(planCustomRows([custom[0]], existing).fresh).toEqual([]);
  });
});

describe('mapCustomLabels', () => {
  it('stores no mapping (and does not throw) when the database fails', async () => {
    const admin = {
      from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'down' } }) }) }),
    } as unknown as SupabaseClient;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(mapCustomLabels(admin, [{ category: 'hobbies', label: 'Bonsai' }])).resolves.toEqual([[]]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
  it('returns nothing for no labels without touching the database', async () => {
    expect(await mapCustomLabels({} as SupabaseClient, [])).toEqual([]);
  });
});

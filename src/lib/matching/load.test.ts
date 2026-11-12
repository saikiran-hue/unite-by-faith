import { describe, expect, it } from 'vitest';
import { fetchChunked, tzOffsetMinutes, withImpliedPicks } from './load';
import { interestSimilarity, scorePair, type MatchPerson, type ScoreContext, type TagPick } from './score';

describe('fetchChunked', () => {
  it('returns every row across chunks and pages with no duplicates', async () => {
    const keys = Array.from({ length: 250 }, (_, i) => i);
    const perKey = 7; // 1750 rows total, more than one page and more than 1000
    const calls: number[] = [];
    const rows = await fetchChunked<{ k: number; n: number }, number>(
      keys,
      async (chunk, from, to) => {
        calls.push(chunk.length);
        const all = chunk.flatMap((k) => Array.from({ length: perKey }, (_, n) => ({ k, n })));
        return { data: all.slice(from, to + 1), error: null };
      },
      100,
      200,
    );
    expect(rows).toHaveLength(250 * perKey);
    expect(new Set(rows.map((r) => `${r.k}:${r.n}`)).size).toBe(250 * perKey);
    expect(Math.max(...calls)).toBeLessThanOrEqual(100);
  });

  it('stops on a short page and handles empty keys', async () => {
    expect(await fetchChunked([], async () => ({ data: [1], error: null }))).toEqual([]);
    let n = 0;
    await fetchChunked(['a'], async () => (n++, { data: [1, 2], error: null }), 100, 5);
    expect(n).toBe(1);
  });

  it('throws on a query error', async () => {
    await expect(fetchChunked(['a'], async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('tzOffsetMinutes', () => {
  const winter = new Date('2026-01-15T12:00:00Z');
  it('is 330 for Asia/Kolkata', () => expect(tzOffsetMinutes('Asia/Kolkata', winter)).toBe(330));
  it('is negative west of UTC', () => {
    expect(tzOffsetMinutes('America/New_York', winter)).toBe(-300);
    expect(tzOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
  });
  it('is 0 for UTC', () => expect(tzOffsetMinutes('UTC', winter)).toBe(0));
});

describe('withImpliedPicks', () => {
  const ctx: ScoreContext = {
    neighbors: new Map(),
    popularity: new Map(),
    activeUsers: 100,
    weights: {
      version: 1,
      total: { faith: 0.4, interests: 0.35, life: 0.25 },
      faith: { tags: 0.6, tradition: 0.25, stage: 0.15 },
      interests: { hobbies: 0.4, tastes: 0.35, skills: 0.25 },
      life: { stage: 0.35, availability: 0.35, place: 0.15, age: 0.15 },
      pod: { min: 0.5, mean: 0.3, anchor: 0.2 },
      neighborMin: 0.6,
      relatedCap: 0.7,
      onlineTzMaxMin: 180,
    },
  };
  const pick = (slug: string, level: TagPick['level'] = 2, starred = false): TagPick => ({
    slug,
    category: 'hobbies',
    level,
    starred,
  });

  it('adds mapped slugs as Casual, unstarred picks', () => {
    const tags = withImpliedPicks([pick('hiking')], [{ category: 'hobbies', mapped_slugs: ['gardening'] }]);
    expect(tags).toEqual([pick('hiking'), { slug: 'gardening', category: 'hobbies', level: 1, starred: false }]);
  });

  it('keeps the explicit pick when the same slug is also implied, and dedupes across own habits', () => {
    const tags = withImpliedPicks(
      [pick('gardening', 3, true)],
      [
        { category: 'hobbies', mapped_slugs: ['gardening', 'plants'] },
        { category: 'hobbies', mapped_slugs: ['plants'] },
        { category: 'hobbies', mapped_slugs: null },
      ],
    );
    expect(tags).toEqual([pick('gardening', 3, true), { slug: 'plants', category: 'hobbies', level: 1, starred: false }]);
  });

  it('an own "Bonsai Trees" mapped to gardening shares a signal with someone who picked Gardening', () => {
    const bonsai = withImpliedPicks([pick('chess')], [{ category: 'hobbies', mapped_slugs: ['gardening'] }]);
    const gardener = [pick('gardening'), pick('running')];
    const withOwn = interestSimilarity(bonsai, gardener, ctx) ?? 0;
    const without = interestSimilarity([pick('chess')], gardener, ctx) ?? 0;
    expect(withOwn).toBeGreaterThan(without);
    const viewer = person('v', bonsai);
    const other = person('g', gardener);
    expect(scorePair(viewer, other, ctx).reasons).toContainEqual({ kind: 'shared_tag', slug: 'gardening' });
  });
});

function person(id: string, tags: TagPick[]): MatchPerson {
  return {
    id,
    isDemo: false,
    tags,
    traditionId: 'baptist',
    traditionFamily: 'evangelical',
    faithStage: 'growing',
    lifeStage: 'early_career',
    availability: ['weekday_evening'],
    age: 30,
    cityId: 1,
    cityName: 'Kochi',
    lat: 10,
    lng: 76,
    tzOffsetMin: 330,
    meetMode: 'both',
    maxDistanceKm: 25,
  };
}

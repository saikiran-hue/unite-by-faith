import { describe, expect, it } from 'vitest';
import { lifeFitMissing, rankDuos, rankPods } from './rank';
import { scorePair, type MatchPerson, type MatchWeights, type ScoreContext } from './score';

const weights: MatchWeights = {
  version: 1,
  total: { faith: 0.4, interests: 0.35, life: 0.25 },
  faith: { tags: 0.6, tradition: 0.25, stage: 0.15 },
  interests: { hobbies: 0.4, tastes: 0.35, skills: 0.25 },
  life: { stage: 0.35, availability: 0.35, place: 0.15, age: 0.15 },
  pod: { min: 0.5, mean: 0.3, anchor: 0.2 },
  neighborMin: 0.6,
  relatedCap: 0.7,
  onlineTzMaxMin: 180,
};
const ctx: ScoreContext = { neighbors: new Map(), popularity: new Map(), activeUsers: 100, weights };

const person = (id: string, slugs: string[]): MatchPerson => ({
  id,
  isDemo: true,
  tags: slugs.map((slug) => ({ slug, category: 'hobbies', level: 2, starred: false })),
  traditionId: 'baptist',
  traditionFamily: 'protestant',
  faithStage: 'growing',
  lifeStage: 'early_career',
  availability: ['weekday_evening'],
  age: 28,
  cityId: 1,
  cityName: 'Bengaluru',
  lat: 12.97,
  lng: 77.59,
  tzOffsetMin: 330,
  meetMode: 'both',
  maxDistanceKm: 25,
});

const complete = {
  birthDate: '1998-04-02',
  gender: 'man',
  languages: ['en'],
  cityId: 1,
  lifeStage: 'early_career',
  faithStage: 'growing',
  traditionId: 'baptist',
};

describe('lifeFitMissing', () => {
  it('is empty for a complete person', () => {
    expect(lifeFitMissing(complete)).toEqual([]);
  });
  it('names a missing city', () => {
    expect(lifeFitMissing({ ...complete, cityId: null })).toEqual(['city']);
  });
  it('names every missing field', () => {
    expect(
      lifeFitMissing({ languages: [], cityId: null, lifeStage: null, faithStage: null, traditionId: null }),
    ).toEqual(['birthDate', 'gender', 'languages', 'city', 'lifeStage', 'faithStage', 'tradition']);
  });
});

describe('rankDuos', () => {
  const viewer = person('v', ['hiking', 'jazz']);
  it('orders by score descending', () => {
    const out = rankDuos(viewer, [person('a', ['x']), person('b', ['hiking', 'jazz']), person('c', ['hiking'])], ctx);
    expect(out.map((r) => r.userId)).toEqual(['b', 'c', 'a']);
  });
  it('caps at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => person(`u${i}`, ['hiking']));
    expect(rankDuos(viewer, many, ctx)).toHaveLength(20);
    expect(rankDuos(viewer, many, ctx, 5)).toHaveLength(5);
  });
  it('breaks ties by user id', () => {
    const out = rankDuos(viewer, [person('z', ['hiking']), person('m', ['hiking']), person('a', ['hiking'])], ctx);
    expect(out.map((r) => r.userId)).toEqual(['a', 'm', 'z']);
  });
});

describe('rankPods', () => {
  const viewer = person('v', ['hiking']);
  it('scores a 1-member pod with the creator as the only member', () => {
    const creator = person('c', ['hiking']);
    const [r] = rankPods(viewer, [{ podId: 'p1', members: [creator], anchorTags: ['hiking'] }], ctx);
    expect(r.podId).toBe('p1');
    expect(r.breakdown).toEqual(scorePair(viewer, creator, ctx).breakdown);
  });
  it('ranks by score and skips empty pods', () => {
    const out = rankPods(
      viewer,
      [
        { podId: 'low', members: [person('a', ['x'])], anchorTags: ['x'] },
        { podId: 'high', members: [person('b', ['hiking'])], anchorTags: ['hiking'] },
        { podId: 'none', members: [], anchorTags: [] },
      ],
      ctx,
    );
    expect(out.map((r) => r.podId)).toEqual(['high', 'low']);
  });
});

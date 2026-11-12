import { describe, expect, it } from 'vitest';
import {
  combinePod,
  interestSimilarity,
  scorePair,
  scorePod,
  tagSimilarity,
  type MatchPerson,
  type MatchWeights,
  type ScoreContext,
  type TagPick,
} from './score';

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

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  neighbors: new Map(),
  popularity: new Map(),
  activeUsers: 100,
  weights,
  ...over,
});

const pick = (slug: string, category: TagPick['category'] = 'hobbies', level: TagPick['level'] = 2, starred = false): TagPick => ({
  slug,
  category,
  level,
  starred,
});

const sym = (pairs: [string, string, number][]) => {
  const m = new Map<string, Map<string, number>>();
  for (const [a, b, s] of pairs) {
    if (!m.has(a)) m.set(a, new Map());
    if (!m.has(b)) m.set(b, new Map());
    m.get(a)!.set(b, s);
    m.get(b)!.set(a, s);
  }
  return m;
};

const person = (o: Partial<MatchPerson> = {}): MatchPerson => ({
  id: 'p',
  isDemo: false,
  tags: [pick('prayer', 'faith'), pick('hiking'), pick('jazz', 'tastes'), pick('coding', 'skills')],
  traditionId: 'baptist',
  traditionFamily: 'evangelical',
  faithStage: 'growing',
  lifeStage: 'early_career',
  availability: ['weekday_evening', 'weekend_morning'],
  age: 30,
  cityId: 1,
  cityName: 'Leeds',
  lat: 53.8,
  lng: -1.55,
  tzOffsetMin: 0,
  meetMode: 'in_person',
  maxDistanceKm: 25,
  ...o,
});

describe('tagSimilarity', () => {
  const c = ctx({ neighbors: sym([['hiking', 'trail-running', 1.0], ['hiking', 'walking', 0.8], ['hiking', 'golf', 0.6]]) });
  it('same slug is 1', () => expect(tagSimilarity('hiking', 'hiking', c)).toBe(1));
  it('scales neighbours', () => {
    expect(tagSimilarity('hiking', 'trail-running', c)).toBeCloseTo(0.7, 9);
    expect(tagSimilarity('hiking', 'walking', c)).toBeCloseTo(0.35, 9);
    expect(tagSimilarity('hiking', 'golf', c)).toBeCloseTo(0, 9);
  });
  it('absent is 0', () => expect(tagSimilarity('hiking', 'chess', c)).toBe(0));
  it('below neighborMin is 0', () => {
    const c2 = ctx({ neighbors: sym([['a', 'b', 0.5]]) });
    expect(tagSimilarity('a', 'b', c2)).toBe(0);
  });
});

describe('interestSimilarity', () => {
  it('identical is 1, disjoint is 0, empty is null', () => {
    const A = [pick('a'), pick('b')];
    expect(interestSimilarity(A, A, ctx())).toBeCloseTo(1, 9);
    expect(interestSimilarity(A, [pick('x')], ctx())).toBe(0);
    expect(interestSimilarity([], A, ctx())).toBeNull();
    expect(interestSimilarity(A, [], ctx())).toBeNull();
  });
  it('rare shared tags count more (IDF)', () => {
    const c = ctx({ popularity: new Map([['coffee', 90], ['hiking', 1]]) });
    const A = [pick('coffee'), pick('hiking')];
    expect(interestSimilarity(A, [pick('hiking')], c)!).toBeGreaterThan(interestSimilarity(A, [pick('coffee')], c)!);
  });
  it('higher level outweighs lower level', () => {
    const partner = [pick('a'), pick('b')];
    const passionate = interestSimilarity([pick('a', 'hobbies', 3), pick('b', 'hobbies', 1)], [pick('a')], ctx())!;
    const casual = interestSimilarity([pick('a', 'hobbies', 1), pick('b', 'hobbies', 3)], [pick('a')], ctx())!;
    expect(passionate).toBeGreaterThan(casual);
    expect(partner.length).toBe(2);
  });
  it('is finite with popularity 0, missing popularity, and zero active users', () => {
    const A = [pick('a'), pick('b')];
    for (const c of [ctx({ popularity: new Map([['a', 0]]) }), ctx(), ctx({ activeUsers: 0 })]) {
      expect(Number.isFinite(interestSimilarity(A, [pick('a')], c)!)).toBe(true);
    }
  });
});

describe('scorePair', () => {
  it('identical people score exactly 100', () => {
    const r = scorePair(person(), person({ id: 'q' }), ctx());
    expect(r.score).toBe(100);
    expect(r.breakdown).toEqual({ faith: 100, interests: 100, lifeFit: 100 });
    expect(r.weightsVersion).toBe(1);
  });

  it('fully different people score exactly 5', () => {
    const a = person();
    // two points on the equator, 1 degree of longitude apart
    const b = person({
      id: 'q',
      tags: [pick('fasting', 'faith'), pick('chess'), pick('metal', 'tastes'), pick('baking', 'skills')],
      traditionId: 'catholic',
      traditionFamily: 'catholic',
      faithStage: 'mature',
      lifeStage: 'parent_older_kids',
      availability: ['weekday_morning'],
      age: 40,
      cityId: 2,
      cityName: 'York',
      lat: 53.96,
      lng: -1.08,
    });
    a.faithStage = 'exploring';
    a.lifeStage = 'student';
    a.age = 30;
    const km = distanceKm(a, b);
    a.maxDistanceKm = km;
    b.maxDistanceKm = km;
    const r = scorePair(a, b, ctx());
    expect(r.score).toBe(5);
  });

  it('empty availability on one side gives 0.5 for that term', () => {
    const same = scorePair(person({ availability: [] }), person({ availability: ['weekday_evening'] }), ctx());
    // life = 0.35*1 + 0.35*0.5 + 0.15*1 + 0.15*1
    expect(same.breakdown.lifeFit).toBe(Math.round(100 * (0.35 + 0.175 + 0.15 + 0.15)));
  });

  it('a person with zero tags gets a finite score and interests 0', () => {
    const r = scorePair(person({ tags: [] }), person(), ctx());
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.breakdown.interests).toBe(0);
  });

  it('tradition: same 1, same family 0.6, else 0.2', () => {
    const only = (b: Partial<MatchPerson>) => {
      const r = scorePair(person({ tags: [], faithStage: null }), person({ tags: [], faithStage: null, ...b }), ctx());
      return r.breakdown.faith;
    };
    // faith = tradition only (tags null, stage null), renormalised to T
    expect(only({})).toBe(100);
    expect(only({ traditionId: 'pentecostal' })).toBe(60);
    expect(only({ traditionId: 'catholic', traditionFamily: 'catholic' })).toBe(20);
  });

  it('related pair yields a related_tag reason; never more than 4 reasons', () => {
    const c = ctx({ neighbors: sym([['hiking', 'trail-running', 0.9]]) });
    const r = scorePair(person({ tags: [pick('hiking')] }), person({ tags: [pick('trail-running')] }), c);
    expect(r.reasons).toContainEqual({ kind: 'related_tag', mine: 'hiking', theirs: 'trail-running' });
    const many = Array.from({ length: 8 }, (_, i) => pick(`t${i}`));
    const r2 = scorePair(person({ tags: many }), person({ tags: many }), ctx());
    expect(r2.reasons.length).toBeLessThanOrEqual(4);
    expect(r2.reasons.length).toBe(4);
  });

  it('puts faith tags first among equals, then tradition, then life', () => {
    const r = scorePair(person({ tags: [pick('prayer', 'faith')] }), person({ tags: [pick('prayer', 'faith')] }), ctx());
    expect(r.reasons[0]).toEqual({ kind: 'shared_tag', slug: 'prayer' });
    expect(r.reasons[1]).toEqual({ kind: 'tradition', same: true, family: 'evangelical' });
    expect(r.reasons[2]).toMatchObject({ kind: 'life' });
  });

  it('distance reason only for different cities', () => {
    const near = scorePair(person({ cityId: 1 }), person({ cityId: 1 }), ctx());
    expect(near.reasons.some((x) => x.kind === 'life' && x.detail === 'distance')).toBe(false);
    const far = scorePair(person({ tags: [] }), person({ tags: [], cityId: 2, cityName: 'Otley', lat: 53.9, lng: -1.69 }), ctx());
    expect(far.reasons.some((x) => x.kind === 'life' && x.detail === 'distance')).toBe(true);
  });

  it('online place score uses timezone gap and never goes below 0', () => {
    const a = person({ meetMode: 'online', cityId: 1, tags: [], faithStage: null, traditionId: null });
    const b = person({ meetMode: 'online', cityId: 2, tzOffsetMin: 600, tags: [], faithStage: null, traditionId: null });
    const r = scorePair(a, b, ctx());
    expect(r.breakdown.lifeFit).toBe(Math.round(100 * (0.35 + 0.35 + 0 + 0.15)));
  });
});

describe('pod', () => {
  it('combinePod weakest link: [0.9,0.9,0.3] anchor 0.5 -> 46', () => {
    expect(Math.round(100 * combinePod([0.9, 0.9, 0.3], 0.5, weights.pod))).toBe(46);
  });
  it('scorePod throws on empty members', () => {
    expect(() => scorePod(person(), [], [], ctx())).toThrow();
  });
  it('scorePod combines pair scores and anchor', () => {
    const v = person();
    const r = scorePod(v, [person({ id: 'm' })], ['prayer', 'hiking', 'jazz', 'coding'], ctx());
    expect(r.score).toBe(Math.round(100 * (0.5 * 1 + 0.3 * 1 + 0.2 * 1)));
    const none = scorePod(v, [person({ id: 'm' })], [], ctx());
    expect(none.score).toBe(80);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('scorePod breakdown is the mean of every member, not the best member', () => {
    const v = person();
    const close = person({ id: 'close' });
    const far = person({ id: 'far', tags: [], lifeStage: 'parent_older_kids', availability: [] });
    const a = scorePair(v, close, ctx()).breakdown;
    const b = scorePair(v, far, ctx()).breakdown;
    expect(a).not.toEqual(b);
    const r = scorePod(v, [close, far], [], ctx());
    expect(r.breakdown).toEqual({
      faith: Math.round((a.faith + b.faith) / 2),
      interests: Math.round((a.interests + b.interests) / 2),
      lifeFit: Math.round((a.lifeFit + b.lifeFit) / 2),
    });
  });
});

function distanceKm(a: MatchPerson, b: MatchPerson): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

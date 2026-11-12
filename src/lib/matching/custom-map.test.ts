import { describe, expect, it } from 'vitest';
import { pickMapped } from './custom-map';
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

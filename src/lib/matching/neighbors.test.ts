import { describe, expect, it } from 'vitest';
import { NEIGHBOR_MIN, centreByCategory, computeNeighbors, tagEmbeddingText } from './neighbors';

const v = (...n: number[]) => Float32Array.from(n);
/** Unit vector at angle whose cosine with (1,0) is c. */
const at = (c: number) => v(c, Math.sqrt(1 - c * c));

describe('tagEmbeddingText', () => {
  it('joins label, description and synonyms', () => {
    expect(tagEmbeddingText({ label: 'Hiking', description: 'Walking trails', synonyms: ['trekking', 'rambling'] })).toBe(
      'Hiking. Walking trails. Also: trekking, rambling',
    );
  });
  it('omits Also when there are no synonyms', () => {
    expect(tagEmbeddingText({ label: 'Hiking', description: 'Walking trails', synonyms: [] })).toBe('Hiking. Walking trails.');
  });
});

describe('computeNeighbors', () => {
  it('excludes cross-category pairs even at cos 0.99', () => {
    const out = computeNeighbors([
      { slug: 'a', category: 'hobbies', vec: v(1, 0) },
      { slug: 'b', category: 'faith', vec: at(0.99) },
    ], { k: 10, min: 0.6 });
    expect(out).toEqual([]);
  });
  it('excludes pairs below the minimum', () => {
    const out = computeNeighbors([
      { slug: 'a', category: 'hobbies', vec: v(1, 0) },
      { slug: 'b', category: 'hobbies', vec: at(0.59) },
    ], { k: 10, min: 0.6 });
    expect(out).toEqual([]);
  });
  it('keeps pairs above the minimum, with no self-pairs', () => {
    const out = computeNeighbors([
      { slug: 'a', category: 'hobbies', vec: v(1, 0) },
      { slug: 'b', category: 'hobbies', vec: at(0.8) },
    ], { k: 10, min: 0.6 });
    expect(NEIGHBOR_MIN).toBe(0.25);
    expect(out.map((r) => `${r.a}>${r.b}`).sort()).toEqual(['a>b', 'b>a']);
    expect(out[0].sim).toBeCloseTo(0.8, 5);
  });
  it('applies the default cutoff: keeps 0.26, drops 0.24', () => {
    const pair = (c: number) => computeNeighbors([
      { slug: 'a', category: 'hobbies', vec: v(1, 0) },
      { slug: 'b', category: 'hobbies', vec: at(c) },
    ]);
    expect(pair(0.26)).toHaveLength(2);
    expect(pair(0.24)).toEqual([]);
  });
  it('caps neighbours per tag at k', () => {
    const items = [
      { slug: 'a', category: 'hobbies' as const, vec: v(1, 0) },
      { slug: 'b', category: 'hobbies' as const, vec: at(0.95) },
      { slug: 'c', category: 'hobbies' as const, vec: at(0.9) },
      { slug: 'd', category: 'hobbies' as const, vec: at(0.85) },
    ];
    const out = computeNeighbors(items, { k: 2, min: 0.6 });
    const fromA = out.filter((r) => r.a === 'a').map((r) => r.b).sort();
    expect(fromA).toEqual(['b', 'c']);
  });
  it('is symmetric', () => {
    const items = [
      { slug: 'a', category: 'hobbies' as const, vec: v(1, 0) },
      { slug: 'b', category: 'hobbies' as const, vec: at(0.95) },
      { slug: 'c', category: 'hobbies' as const, vec: at(0.9) },
      { slug: 'd', category: 'hobbies' as const, vec: at(0.85) },
    ];
    const out = computeNeighbors(items, { k: 1, min: 0.6 });
    const keys = new Set(out.map((r) => `${r.a}>${r.b}`));
    for (const r of out) expect(keys.has(`${r.b}>${r.a}`)).toBe(true);
  });
});

describe('centreByCategory', () => {
  const norm = (x: Float32Array) => Math.hypot(...x);
  it('zeroes each category mean (before renormalising) and returns unit vectors', () => {
    const out = centreByCategory([
      { slug: 'a', category: 'hobbies' as const, vec: v(1, 0, 0) },
      { slug: 'b', category: 'hobbies' as const, vec: v(0, 1, 0) },
      { slug: 'c', category: 'hobbies' as const, vec: v(0, 0, 1) },
      { slug: 'd', category: 'faith' as const, vec: v(1, 0, 0) },
      { slug: 'e', category: 'faith' as const, vec: v(0.6, 0.8, 0) },
    ]);
    for (const o of out.filter((o) => o.category === 'hobbies')) expect(norm(o.vec)).toBeCloseTo(1, 5);
    for (const o of out.filter((o) => o.category === 'faith')) expect(norm(o.vec)).toBeCloseTo(1, 5);
    // symmetric hobbies set: centred vectors still sum to ~0
    const sum = [0, 1, 2].map((d) => out.slice(0, 3).reduce((t, o) => t + o.vec[d], 0));
    for (const x of sum) expect(x).toBeCloseTo(0, 5);
  });
  it('handles a lone-tag category without NaN', () => {
    const [o] = centreByCategory([{ slug: 'a', category: 'skills' as const, vec: v(1, 0) }]);
    expect([...o.vec].every(Number.isFinite)).toBe(true);
  });
});

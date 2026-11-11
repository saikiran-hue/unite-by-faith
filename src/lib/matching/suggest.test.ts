import { describe, expect, it } from 'vitest';
import { MEANING_MIN, TEXT_MIN, normaliseQuery, pickSuggestions } from './suggest';

describe('normaliseQuery', () => {
  it('returns null under 2 chars', () => {
    expect(normaliseQuery('')).toBeNull();
    expect(normaliseQuery('a')).toBeNull();
    expect(normaliseQuery('  a  ')).toBeNull();
  });
  it('trims, collapses whitespace and lowercases', () => {
    expect(normaliseQuery('  Rock   CLIMBING ')).toBe('rock climbing');
  });
  it('caps at 60 chars', () => {
    expect(normaliseQuery('x'.repeat(200))).toHaveLength(60);
  });
  it('leaves special characters untouched', () => {
    expect(normaliseQuery("%_'")).toBe("%_'");
  });
});

describe('pickSuggestions', () => {
  const eps = 1e-6;
  it('text boundary', () => {
    expect(pickSuggestions([{ slug: 'a', score: TEXT_MIN }], []).source).toBe('text');
    expect(pickSuggestions([{ slug: 'a', score: TEXT_MIN - eps }], []).source).toBe('none');
  });
  it('meaning boundary', () => {
    expect(pickSuggestions([], [{ slug: 'b', cos: MEANING_MIN }]).source).toBe('meaning');
    expect(pickSuggestions([], [{ slug: 'b', cos: MEANING_MIN - eps }]).source).toBe('none');
  });
  it('text beats meaning', () => {
    const r = pickSuggestions([{ slug: 'a', score: 0.9 }], [{ slug: 'b', cos: 0.99 }]);
    expect(r).toEqual({ source: 'text', slugs: ['a'] });
  });
  it('falls back to meaning when text is weak', () => {
    const r = pickSuggestions([{ slug: 'a', score: 0.1 }], [{ slug: 'b', cos: 0.9 }]);
    expect(r).toEqual({ source: 'meaning', slugs: ['b'] });
  });
  it('limits to 8 text and 3 meaning hits', () => {
    const t = Array.from({ length: 12 }, (_, i) => ({ slug: `t${i}`, score: 0.9 }));
    const v = Array.from({ length: 6 }, (_, i) => ({ slug: `v${i}`, cos: 0.95 }));
    expect(pickSuggestions(t, []).slugs).toHaveLength(8);
    expect(pickSuggestions([], v).slugs).toHaveLength(3);
  });
  it('none when nothing qualifies', () => {
    expect(pickSuggestions([], [])).toEqual({ source: 'none', slugs: [] });
  });
});

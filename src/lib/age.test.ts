import { describe, expect, it } from 'vitest';
import { ageOn, isAdult, defaultAgeRange } from './age';

describe('ageOn', () => {
  it('counts a full year on the birthday', () => {
    expect(ageOn('2008-11-11', new Date('2026-11-11'))).toBe(18);
  });

  it('does not count the year the day before the birthday', () => {
    expect(ageOn('2008-11-12', new Date('2026-11-11'))).toBe(17);
  });

  it('handles leap-day births before the anniversary in a non-leap year', () => {
    expect(ageOn('2004-02-29', new Date('2026-02-28'))).toBe(21);
  });

  it('handles leap-day births after the anniversary in a non-leap year', () => {
    expect(ageOn('2004-02-29', new Date('2026-03-01'))).toBe(22);
  });

  it('throws on a malformed date', () => {
    expect(() => ageOn('not-a-date', new Date())).toThrow();
  });
});

describe('isAdult', () => {
  it('is false for someone under 18', () => {
    expect(isAdult('2008-11-12', new Date('2026-11-11'))).toBe(false);
  });

  it('is true on the 18th birthday', () => {
    expect(isAdult('2008-11-11', new Date('2026-11-11'))).toBe(true);
  });
});

describe('defaultAgeRange', () => {
  it('gives 18 to 26 for a 20 year old', () => {
    expect(defaultAgeRange(20)).toEqual({ min: 18, max: 26 });
  });

  it('gives 39 to 51 for a 45 year old', () => {
    expect(defaultAgeRange(45)).toEqual({ min: 39, max: 51 });
  });
});

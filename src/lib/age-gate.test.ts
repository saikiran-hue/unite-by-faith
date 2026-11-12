import { describe, expect, it } from 'vitest';
import { checkBirthDate, needsAgeCheck, UNDERAGE_MESSAGE } from './age-gate';

const today = new Date('2026-11-12');

describe('needsAgeCheck', () => {
  it('asks a new Google account', () => {
    expect(needsAgeCheck({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(true);
  });
  it('lets a verified Google account through', () => {
    expect(needsAgeCheck({ app_metadata: { provider: 'google', age_verified: true } })).toBe(false);
  });
  it('only trusts a real true, not a truthy string', () => {
    expect(needsAgeCheck({ app_metadata: { provider: 'google', age_verified: 'yes' } })).toBe(true);
  });
  it('never asks password accounts (demo and local test users)', () => {
    expect(needsAgeCheck({ app_metadata: { provider: 'email' } })).toBe(false);
    expect(needsAgeCheck({ app_metadata: null })).toBe(false);
  });
});

describe('checkBirthDate', () => {
  it('accepts someone turning 18 today', () => {
    expect(checkBirthDate('2008-11-12', today)).toEqual({ ok: true, birthDate: '2008-11-12', age: 18 });
  });
  it('refuses someone 18 tomorrow as underage', () => {
    expect(checkBirthDate('2008-11-13', today)).toEqual({ ok: false, underage: true, message: UNDERAGE_MESSAGE });
  });
  it('refuses future, malformed and missing dates without calling them underage', () => {
    for (const v of ['2030-01-01', '2000-02-30', '12/11/2000', '', undefined, 42]) {
      const r = checkBirthDate(v, today);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.underage).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { lifeFitBody, lifeFitFrom, validateLifeFit, type LifeFitValue } from './life-fit';

const full: LifeFitValue = {
  cityId: 1, cityName: 'Pune', meetMode: 'both', maxDistanceKm: 25, lifeStage: 'student', availability: [],
  languages: ['en'], traditionId: 'csi', onlyMyTradition: false, faithStage: 'growing', gender: 'man',
  ageMin: '20', ageMax: '30',
};

describe('validateLifeFit', () => {
  it('accepts a complete section', () => {
    expect(validateLifeFit(full)).toEqual({});
  });
  it('flags every missing required field', () => {
    const e = validateLifeFit(lifeFitFrom(null, null));
    expect(Object.keys(e).sort()).toEqual(
      ['agemax', 'agemin', 'city', 'faith', 'gender', 'languages', 'lifestage', 'tradition'].sort(),
    );
  });
  it('rejects an inverted or under-18 age range', () => {
    expect(validateLifeFit({ ...full, ageMin: '30', ageMax: '25' }).agemax).toMatch(/below the minimum/);
    expect(validateLifeFit({ ...full, ageMin: '17' }).agemin).toBeDefined();
  });
});

describe('lifeFitFrom', () => {
  it('defaults the age range to six years either side of the viewer', () => {
    const u = { private: { birth_date: '2000-06-01', age_min: null, age_max: null, max_distance_km: 25, only_my_tradition: false, gender: null } } as never;
    const v = lifeFitFrom(u, null, new Date('2026-11-11'));
    expect([v.ageMin, v.ageMax]).toEqual(['20', '32']);
  });
});

describe('lifeFitBody', () => {
  it('sends numbers for ages and the picked city id', () => {
    const b = lifeFitBody(full);
    expect(b.ageMin).toBe(20);
    expect(b.cityId).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { buildProfileUpdate } from './profile-update';

const tag = (slug: string, isPriority = false, level = 2) => ({ slug, category: 'faith', level, isPriority });

describe('buildProfileUpdate', () => {
  it('a tags-only body changes no profile or private field', () => {
    const r = buildProfileUpdate({ tags: [tag('prayer')] });
    expect(r).toEqual({
      profile: {},
      private: {},
      tags: [{ slug: 'prayer', category: 'faith', level: 2, isPriority: false }],
    });
  });

  it('maps only the keys present', () => {
    const r = buildProfileUpdate({ headline: ' Hi ', ageMin: 20, bogus: 1 });
    expect(r).toEqual({ profile: { headline: 'Hi' }, private: { age_min: 20 } });
  });

  it('rejects an invalid life stage', () => {
    expect(buildProfileUpdate({ lifeStage: 'retired' })).toEqual({
      error: { field: 'lifeStage', message: expect.any(String) },
    });
  });

  it('rejects four starred tags', () => {
    const tags = ['a', 'b', 'c', 'd'].map((s) => tag(s, true));
    expect(buildProfileUpdate({ tags })).toEqual({ error: { field: 'tags', message: expect.any(String) } });
  });

  it('rejects ageMin 17, and ageMax below ageMin', () => {
    expect(buildProfileUpdate({ ageMin: 17 })).toMatchObject({ error: { field: 'ageMin' } });
    expect(buildProfileUpdate({ ageMin: 30, ageMax: 25 })).toMatchObject({ error: { field: 'ageMax' } });
  });

  it('rejects birthDate', () => {
    expect(buildProfileUpdate({ birthDate: '1990-01-01' })).toEqual({
      error: { field: 'birthDate', message: "Date of birth can't be changed here." },
    });
  });

  it('rejects empty languages and wrong types', () => {
    expect(buildProfileUpdate({ languages: [] })).toMatchObject({ error: { field: 'languages' } });
    expect(buildProfileUpdate({ headline: 5 })).toMatchObject({ error: { field: 'headline' } });
    expect(buildProfileUpdate({ maxDistanceKm: 30 })).toMatchObject({ error: { field: 'maxDistanceKm' } });
  });

  it('dedupes availability and accepts legacy selectedTags at level 2', () => {
    const r = buildProfileUpdate({
      availability: ['weekday_morning', 'weekday_morning'],
      selectedTags: [{ slug: 'x', category: 'faith', isPriority: true }],
    });
    expect(r).toEqual({
      profile: { availability: ['weekday_morning'] },
      private: {},
      tags: [{ slug: 'x', category: 'faith', level: 2, isPriority: true }],
    });
  });

  it('rejects duplicate slugs, bad level, over 30 tags', () => {
    expect(buildProfileUpdate({ tags: [tag('a'), tag('a')] })).toMatchObject({ error: { field: 'tags' } });
    expect(buildProfileUpdate({ tags: [tag('a', false, 4)] })).toMatchObject({ error: { field: 'tags' } });
    const many = Array.from({ length: 31 }, (_, i) => tag(`t${i}`));
    expect(buildProfileUpdate({ tags: many })).toMatchObject({ error: { field: 'tags' } });
  });
});

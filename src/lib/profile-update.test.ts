import { describe, expect, it } from 'vitest';
import {
  buildProfileUpdate,
  CUSTOM_CLASH_MESSAGE,
  findCatalogueClash,
  parsePersonalTopics,
  titleCaseLabel,
  validCustomLabel,
} from './profile-update';

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

  it('rejects empty or blank fullName, headline, avatarUrl; allows empty bio', () => {
    expect(buildProfileUpdate({ fullName: '  ' })).toEqual({ error: { field: 'fullName', message: 'Enter your name.' } });
    expect(buildProfileUpdate({ headline: '' })).toEqual({ error: { field: 'headline', message: 'Add a short headline.' } });
    expect(buildProfileUpdate({ avatarUrl: ' ' })).toEqual({ error: { field: 'avatarUrl', message: 'Choose a photo.' } });
    expect(buildProfileUpdate({ bio: '', church: '' })).toEqual({ profile: { bio: '', church_or_fellowship: '' }, private: {} });
  });

  it('enforces length caps at the boundary', () => {
    expect(buildProfileUpdate({ fullName: 'a'.repeat(80) })).toMatchObject({ profile: {} });
    expect(buildProfileUpdate({ fullName: 'a'.repeat(81) })).toMatchObject({ error: { field: 'fullName' } });
    expect(buildProfileUpdate({ bio: 'a'.repeat(601) })).toMatchObject({ error: { field: 'bio' } });
  });

  it('bounds ages to 18..99, including ageMax alone', () => {
    expect(buildProfileUpdate({ ageMax: 17 })).toMatchObject({ error: { field: 'ageMax' } });
    expect(buildProfileUpdate({ ageMax: 100 })).toMatchObject({ error: { field: 'ageMax' } });
    expect(buildProfileUpdate({ ageMin: 100 })).toMatchObject({ error: { field: 'ageMin' } });
    expect(buildProfileUpdate({ ageMax: 99 })).toMatchObject({ private: { age_max: 99 } });
  });
});

describe('customTags', () => {
  const ct = (label: string, category = 'hobbies') => ({ category, label });
  const parse = (customTags: unknown) => buildProfileUpdate({ customTags });

  it('is left out when not sent', () => {
    expect(buildProfileUpdate({ fullName: 'A' })).not.toHaveProperty('customTags');
  });
  it('trims and collapses whitespace', () => {
    expect(parse([ct('  Bonsai   Trees ')])).toMatchObject({ customTags: [{ category: 'hobbies', label: 'Bonsai Trees' }] });
  });
  it('accepts an empty list (clears the set)', () => {
    expect(parse([])).toMatchObject({ customTags: [] });
  });
  it('rejects labels under 2 or over 40 characters', () => {
    expect(parse([ct(' a ')])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse([ct('x'.repeat(41))])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse([ct('x'.repeat(40))])).not.toHaveProperty('error');
  });
  it('strips control and zero-width characters, and rejects labels with no letter or number', () => {
    expect(parse([ct('Bon\u200Bsai\u0007 Trees')])).toMatchObject({ customTags: [{ label: 'Bon sai Trees' }] });
    expect(parse([ct('\u200B\u200B')])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse([ct('--')])).toMatchObject({ error: { field: 'customTags' } });
    // Cleaned before the duplicate check, so an invisible character can't sneak past it.
    expect(parse([ct('Bonsai'), ct('Bonsai\u200B')])).toMatchObject({ error: { field: 'customTags' } });
  });
  it('rejects a bad category or a non-text label', () => {
    expect(parse([ct('Bonsai', 'food')])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse([{ category: 'hobbies', label: 4 }])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse('Bonsai')).toMatchObject({ error: { field: 'customTags' } });
  });
  it('rejects duplicates in a category, ignoring case, but allows the same words in another', () => {
    expect(parse([ct('Bonsai'), ct('bonsai ')])).toMatchObject({ error: { field: 'customTags' } });
    expect(parse([ct('Bonsai'), ct('Bonsai', 'tastes')])).not.toHaveProperty('error');
  });
  it('caps at 5 per category and 12 in all', () => {
    const five = ['Aa', 'Bb', 'Cc', 'Dd', 'Ee'];
    expect(parse(five.map((l) => ct(l)))).not.toHaveProperty('error');
    expect(parse([...five, 'Ff'].map((l) => ct(l)))).toMatchObject({ error: { field: 'customTags' } });
    const twelve = ['faith', 'hobbies', 'tastes'].flatMap((c) => ['Aa', 'Bb', 'Cc', 'Dd'].map((l) => ct(l, c)));
    expect(parse(twelve)).not.toHaveProperty('error');
    expect(parse([...twelve, ct('Zz', 'skills')])).toMatchObject({ error: { field: 'customTags' } });
  });
});

describe('findCatalogueClash', () => {
  const catalogue = [
    { label: 'Gardening', category: 'hobbies' },
    { label: 'Choir', category: 'faith', is_active: false },
  ];
  it('finds an exact same-category match, ignoring case', () => {
    expect(findCatalogueClash([{ category: 'hobbies', label: 'gardening' }], catalogue)).toEqual({
      category: 'hobbies',
      label: 'gardening',
    });
  });
  it('ignores other categories, retired habits and near matches', () => {
    expect(findCatalogueClash([{ category: 'tastes', label: 'Gardening' }], catalogue)).toBeNull();
    expect(findCatalogueClash([{ category: 'faith', label: 'Choir' }], catalogue)).toBeNull();
    expect(findCatalogueClash([{ category: 'hobbies', label: 'Gardening Club' }], catalogue)).toBeNull();
  });
  it('carries the agreed message', () => {
    expect(CUSTOM_CLASH_MESSAGE).toBe('That one is already in the list — pick it above.');
  });
});

describe('titleCaseLabel', () => {
  it('capitalises each word and keeps the rest as typed', () => {
    expect(titleCaseLabel('  bonsai   trees ')).toBe('Bonsai Trees');
    expect(titleCaseLabel('rust programming')).toBe('Rust Programming');
    expect(titleCaseLabel('learning TypeScript')).toBe('Learning TypeScript');
    expect(titleCaseLabel('iPhone repair')).toBe('iPhone Repair');
  });
  it('validCustomLabel checks the cleaned length', () => {
    expect(validCustomLabel(' a ')).toBe(false);
    expect(validCustomLabel('ab')).toBe(true);
    expect(validCustomLabel('x'.repeat(41))).toBe(false);
    expect(validCustomLabel('\u200B\u200B')).toBe(false);
  });
});

describe('parsePersonalTopics', () => {
  it('cleans labels and keeps order', () => {
    expect(parsePersonalTopics(['  World\u200b  War 2 ', 'Learning English'])).toEqual(['World War 2', 'Learning English']);
    expect(buildProfileUpdate({ personalTopics: [] })).toMatchObject({ personalTopics: [] });
  });
  it('rejects too short, too long, no letter or digit, duplicates and more than 10', () => {
    expect(parsePersonalTopics(['a'])).toHaveProperty('error.field', 'personalTopics');
    expect(parsePersonalTopics(['x'.repeat(41)])).toHaveProperty('error');
    expect(parsePersonalTopics(['--'])).toHaveProperty('error');
    expect(parsePersonalTopics(['Chess', 'chess'])).toHaveProperty('error.message', 'You added “chess” twice.');
    expect(parsePersonalTopics(Array.from({ length: 11 }, (_, i) => `Topic ${i}`))).toHaveProperty('error');
    expect(parsePersonalTopics('Chess')).toHaveProperty('error');
    expect(parsePersonalTopics([3])).toHaveProperty('error');
  });
  it('NFC-normalises so composed and decomposed forms are one topic', () => {
    expect(parsePersonalTopics(['Caf\u00e9 Church', 'Cafe\u0301 church'])).toHaveProperty('error');
  });
});

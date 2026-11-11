import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SUBGROUPS as SHARED_SUBGROUPS, TRADITION_FAMILIES as SHARED_FAMILIES } from './catalogue-constants';

// Allowed subgroups per category (spec §4.2). Closed lists: change deliberately, together with scripts/catalogue-constants.ts.
const SUBGROUPS: Record<string, string[]> = {
  faith: ['Prayer', 'Scripture', 'Worship', 'Serving', 'Community', 'Learning'],
  hobbies: ['Outdoors', 'Sports', 'Creative', 'Music', 'Games', 'Food', 'Reading'],
  tastes: ['Food & Drink', 'Film & TV', 'Books', 'Music', 'Style & Home', 'Travel'],
  skills: ['Tech', 'Business', 'Creative Work', 'Care & Teaching', 'Trades & Practical'],
};

const TRADITION_FAMILIES = [
  'evangelical',
  'pentecostal_charismatic',
  'reformed_presbyterian',
  'baptist',
  'methodist_wesleyan',
  'anglican_episcopal',
  'lutheran',
  'catholic',
  'eastern_orthodox',
  'oriental_orthodox',
  'mar_thoma_st_thomas',
  'non_denominational',
  'other',
];

interface Tag {
  slug: string;
  label: string;
  category: string;
  subgroup: string;
  description: string;
  synonyms: string[];
  legacySlugs: string[];
}
interface Tradition {
  id: string;
  name: string;
  family: string;
}

const root = path.resolve(__dirname, '..');
const tags: Tag[] = JSON.parse(readFileSync(path.join(root, 'supabase/seed-data/catalogue.json'), 'utf8'));
const traditions: Tradition[] = JSON.parse(readFileSync(path.join(root, 'supabase/seed-data/traditions.json'), 'utf8'));

// The legacy slugs are read from the 0002 seed itself so the test cannot drift from it.
const legacySlugs = [
  ...readFileSync(path.join(root, 'supabase/migrations/0002_seed_taxonomy_and_community.sql'), 'utf8').matchAll(
    /^ {2}\('([a-z0-9-]+)', '/gm,
  ),
].map((m) => m[1]);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('catalogue.json', () => {
  it('shares its closed lists with the builder constants', () => {
    expect(SHARED_SUBGROUPS).toEqual(SUBGROUPS);
    expect([...SHARED_FAMILIES]).toEqual(TRADITION_FAMILIES);
  });

  it('has 300-400 tags and finds the 0002 legacy slugs', () => {
    expect(tags.length).toBeGreaterThanOrEqual(300);
    expect(tags.length).toBeLessThanOrEqual(400);
    expect(legacySlugs.length).toBeGreaterThanOrEqual(39);
  });

  it('has unique kebab-case slugs and unique labels', () => {
    const slugs = tags.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s, s).toMatch(KEBAB);
    const labels = tags.map((t) => t.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('maps every legacy slug exactly once (unchanged slug or a successor legacySlugs entry)', () => {
    const slugSet = new Set(tags.map((t) => t.slug));
    for (const legacy of legacySlugs) {
      const asSlug = slugSet.has(legacy) ? 1 : 0;
      const asLegacy = tags.filter((t) => t.legacySlugs.includes(legacy)).length;
      expect(asSlug + asLegacy, legacy).toBe(1);
    }
    for (const t of tags) {
      for (const l of t.legacySlugs) expect(legacySlugs, `${t.slug} lists unknown legacy slug ${l}`).toContain(l);
    }
  });

  it('has at least 12 tags in each of the 4 categories', () => {
    expect(Object.keys(SUBGROUPS).sort()).toEqual(['faith', 'hobbies', 'skills', 'tastes']);
    for (const c of Object.keys(SUBGROUPS)) {
      expect(tags.filter((t) => t.category === c).length, c).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps skills at or under 20% so faith stays first', () => {
    const skills = tags.filter((t) => t.category === 'skills').length;
    expect(skills / tags.length).toBeLessThanOrEqual(0.2);
    const faith = tags.filter((t) => t.category === 'faith').length;
    expect(faith).toBeGreaterThan(skills);
  });

  it('uses only allowed subgroups for the tag category, and every subgroup is used', () => {
    for (const t of tags) {
      expect(SUBGROUPS[t.category], `${t.slug} category`).toBeDefined();
      expect(SUBGROUPS[t.category], `${t.slug} subgroup ${t.subgroup}`).toContain(t.subgroup);
    }
    for (const [c, subs] of Object.entries(SUBGROUPS)) {
      for (const s of subs) {
        expect(tags.some((t) => t.category === c && t.subgroup === s), `${c}/${s}`).toBe(true);
      }
    }
  });

  it('has lowercase, non-empty, de-duplicated synonyms', () => {
    for (const t of tags) {
      for (const s of t.synonyms) {
        expect(s, `${t.slug}:${s}`).toBe(s.toLowerCase());
        expect(s.trim(), t.slug).toBe(s);
        expect(s.length, t.slug).toBeGreaterThan(0);
      }
      expect(new Set(t.synonyms).size, t.slug).toBe(t.synonyms.length);
    }
  });

  it('has plain labels, one-sentence descriptions and no emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const t of tags) {
      expect(t.label.trim(), t.slug).toBe(t.label);
      expect(t.label.length, t.slug).toBeGreaterThan(0);
      expect(t.label.length, t.slug).toBeLessThanOrEqual(40);
      expect(t.description.length, t.slug).toBeGreaterThan(10);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(120);
      expect(t.description.endsWith('.'), t.slug).toBe(true);
      expect(emoji.test(t.label + t.description + t.synonyms.join(' ')), t.slug).toBe(false);
    }
  });
});

describe('traditions.json', () => {
  it('has 25-40 entries with unique kebab-case ids', () => {
    expect(traditions.length).toBeGreaterThanOrEqual(25);
    expect(traditions.length).toBeLessThanOrEqual(40);
    const ids = traditions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(KEBAB);
    for (const t of traditions) expect(t.name.length, t.id).toBeGreaterThan(0);
  });

  it('uses only families from the closed list, and every family is used', () => {
    for (const t of traditions) expect(TRADITION_FAMILIES, t.id).toContain(t.family);
    for (const f of TRADITION_FAMILIES) expect(traditions.some((t) => t.family === f), f).toBe(true);
  });
});

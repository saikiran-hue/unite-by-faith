import { describe, expect, it } from 'vitest';
import type { TaxonomyTag } from '@/types/database';
import { habitList, TOP_N } from './habit-list';

const tag = (slug: string, o: Partial<TaxonomyTag> = {}): TaxonomyTag => ({
  slug,
  label: slug,
  category: 'faith',
  description: '',
  icon_name: '',
  sort_order: 0,
  ...o,
});

describe('habitList', () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    tag(`t${i}`, { sort_order: i, popularity: i === 14 ? 99 : 0, subgroup: i < 8 ? 'Prayer' : 'Study' })
  );

  it('shows the top habits by popularity, then sort order, within the category', () => {
    const l = habitList([...many, tag('h', { category: 'hobbies', popularity: 100 })], 'faith', []);
    expect(l.shown).toHaveLength(TOP_N);
    expect(l.shown[0].slug).toBe('t14');
    expect(l.shown.slice(1, 3).map((t) => t.slug)).toEqual(['t0', 't1']);
    expect(l.total).toBe(15);
  });

  it('keeps picks outside the top list visible', () => {
    const l = habitList(many, 'faith', ['t13']);
    expect(l.shown.at(-1)?.slug).toBe('t13');
    expect(l.shown).toHaveLength(TOP_N + 1);
  });

  it('groups every offered habit by subgroup in sort order, with retired picks only', () => {
    const tags = [...many, tag('old', { is_active: false, sort_order: 20, subgroup: 'Study' }), tag('gone', { is_active: false })];
    const l = habitList(tags, 'faith', ['old']);
    expect(l.groups.map(([g]) => g)).toEqual(['Prayer', 'Study']);
    expect(l.groups[1][1].at(-1)?.slug).toBe('old');
    expect(l.groups.flatMap(([, ts]) => ts).some((t) => t.slug === 'gone')).toBe(false);
    expect(l.total).toBe(15);
  });
});

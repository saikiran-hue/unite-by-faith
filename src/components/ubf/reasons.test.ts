import { describe, expect, it } from 'vitest';
import { reasonText } from '@/components/ubf';
import type { TaxonomyTag } from '@/types/database';

const tagMap = new Map<string, TaxonomyTag>([
  ['hiking', { slug: 'hiking', label: 'Hiking' } as TaxonomyTag],
  ['trail-running', { slug: 'trail-running', label: 'Trail running' } as TaxonomyTag],
]);

describe('reasonText', () => {
  it('shared tag', () => {
    expect(reasonText({ kind: 'shared_tag', slug: 'hiking' }, tagMap)).toBe('You both love Hiking');
  });
  it('related tag', () => {
    expect(reasonText({ kind: 'related_tag', mine: 'hiking', theirs: 'trail-running' }, tagMap)).toBe(
      'Your Hiking, their Trail running',
    );
  });
  it('same tradition uses the tradition name', () => {
    expect(
      reasonText({ kind: 'tradition', same: true, family: 'baptist' }, tagMap, { tradition: 'Baptist' }),
    ).toBe('Both Baptist');
  });
  it('same family', () => {
    expect(reasonText({ kind: 'tradition', same: false, family: 'eastern_orthodox' }, tagMap)).toBe(
      'Both Eastern Orthodox traditions',
    );
  });
  it('life stage', () => {
    expect(reasonText({ kind: 'life', detail: 'same_stage', value: 'student' }, tagMap)).toBe('Both Student');
  });
  it('shared slots', () => {
    expect(
      reasonText({ kind: 'life', detail: 'availability', value: 'weekday_evening,weekend_morning' }, tagMap),
    ).toBe('Both free weekday evening and weekend morning');
  });
  it('same city', () => {
    expect(reasonText({ kind: 'life', detail: 'same_city', value: 'Pune' }, tagMap)).toBe('Both in Pune');
  });
  it('distance', () => {
    expect(reasonText({ kind: 'life', detail: 'distance', value: '12' }, tagMap)).toBe('12 km apart');
  });
  it('falls back to the slug when a label is missing', () => {
    expect(reasonText({ kind: 'shared_tag', slug: 'unknown-thing' }, tagMap)).toBe('You both love unknown-thing');
  });
});

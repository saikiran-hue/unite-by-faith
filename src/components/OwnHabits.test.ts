import { describe, expect, it } from 'vitest';
import type { CustomTag } from '@/types/database';
import { ownChanged, shouldSendOwn } from './OwnHabits';

const saved = (label: string, mapped: string[] = []): CustomTag => ({
  id: label,
  category: 'hobbies',
  label,
  mapped: mapped.map((slug) => ({ slug, label: slug })),
});
const own = (label: string) => ({ category: 'hobbies' as const, label });

describe('ownChanged', () => {
  it('ignores order and case, and sees adds, removes and renames', () => {
    expect(ownChanged([own('A b'), own('C d')], [own('c D'), own('a B')])).toBe(false);
    expect(ownChanged([own('A b')], [])).toBe(true);
    expect(ownChanged([], [own('A b')])).toBe(true);
    expect(ownChanged([own('A b')], [own('A c')])).toBe(true);
  });
});

describe('shouldSendOwn', () => {
  it('sends when changed', () => {
    expect(shouldSendOwn([own('Hiking Club')], [], true)).toBe(true);
  });
  it('sends an unchanged set that still has an unmapped habit, so the server retries it', () => {
    // Also the remove-then-re-add-in-one-edit case: the set looks unchanged.
    expect(shouldSendOwn([own('Bonsai Trees')], [saved('Bonsai Trees')], true)).toBe(true);
  });
  it('skips an unchanged, fully mapped set', () => {
    expect(shouldSendOwn([own('Mountain Trekking')], [saved('Mountain Trekking', ['hiking'])], true)).toBe(false);
  });
  it('never sends when own habits failed to load', () => {
    expect(shouldSendOwn([own('Hiking Club')], [], false)).toBe(false);
  });
});

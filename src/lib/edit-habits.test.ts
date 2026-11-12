import { describe, expect, it } from 'vitest';
import type { PillarCategory } from '@/types/database';
import { EDIT_STEPS, isDirty, stepForError, type HabitDraft } from './edit-habits';

const start: HabitDraft = {
  picked: ['bible', 'hike', 'coffee'],
  starred: ['bible'],
  levels: { bible: 3, hike: 2, coffee: 1 },
  own: [{ category: 'hobbies', label: 'Kite Flying' }],
};
const copy = (d: HabitDraft): HabitDraft => ({ ...d, picked: [...d.picked], starred: [...d.starred], levels: { ...d.levels }, own: [...d.own] });

describe('EDIT_STEPS', () => {
  it('is the four categories in order, faith first', () => {
    expect(EDIT_STEPS.map((s) => s.name)).toEqual(['Faith Rhythms', 'Hobbies', 'Tastes', 'Tech & Skills']);
    expect(EDIT_STEPS.map((s) => s.cat.key)).toEqual(['faith', 'hobbies', 'tastes', 'skills']);
  });
});

describe('isDirty', () => {
  it('is false for an untouched draft, even reordered', () => {
    const d = copy(start);
    d.picked.reverse();
    d.own = [{ category: 'hobbies', label: 'kite flying' }];
    expect(isDirty(d, start)).toBe(false);
  });

  it('sees a picked, unpicked, starred or level change', () => {
    expect(isDirty({ ...copy(start), picked: [...start.picked, 'tea'] }, start)).toBe(true);
    expect(isDirty({ ...copy(start), picked: ['bible', 'hike'] }, start)).toBe(true);
    expect(isDirty({ ...copy(start), starred: ['bible', 'hike'] }, start)).toBe(true);
    expect(isDirty({ ...copy(start), levels: { ...start.levels, hike: 3 } }, start)).toBe(true);
  });

  it('ignores levels of habits that are not picked', () => {
    expect(isDirty({ ...copy(start), levels: { ...start.levels, tea: 3 } }, start)).toBe(false);
  });

  it('sees an own habit added or removed', () => {
    expect(isDirty({ ...copy(start), own: [] }, start)).toBe(true);
    expect(isDirty({ ...copy(start), own: [...start.own, { category: 'faith', label: 'Psalms' }] }, start)).toBe(true);
  });
});

describe('stepForError', () => {
  const cats: Record<string, PillarCategory> = { bible: 'faith', hike: 'hobbies', coffee: 'tastes' };
  const ctx = {
    steps: EDIT_STEPS,
    current: 3,
    picked: ['bible', 'hike'],
    categoryOf: (s: string) => cats[s],
    own: [] as HabitDraft['own'],
    savedOwn: [] as HabitDraft['own'],
  };

  it('sends too few habits to the first step with no picks', () => {
    expect(stepForError('min', ctx)).toBe(2);
    expect(stepForError('min', { ...ctx, picked: [] })).toBe(0);
  });

  it('sends an own-habit error to the first step whose own habits changed', () => {
    const own = [
      { category: 'hobbies' as const, label: 'Kites' },
      { category: 'skills' as const, label: 'Rust' },
    ];
    expect(stepForError('customTags', { ...ctx, own, savedOwn: [own[0]] })).toBe(3);
    expect(stepForError('customTags', { ...ctx, current: 0, own, savedOwn: own })).toBe(1);
  });

  it('stays on the current step for other problems', () => {
    expect(stepForError('tags', ctx)).toBe(3);
  });
});

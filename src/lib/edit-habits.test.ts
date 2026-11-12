import { describe, expect, it } from 'vitest';
import type { PillarCategory } from '@/types/database';
import { EDIT_STEPS, editSteps, isDirty, PERSONAL_STEP, stepForError, type HabitDraft } from './edit-habits';

const start: HabitDraft = {
  picked: ['bible', 'hike', 'coffee'],
  starred: ['bible'],
  levels: { bible: 3, hike: 2, coffee: 1 },
  own: [{ category: 'hobbies', label: 'Kite Flying' }],
  personal: ['World War 2'],
};
const copy = (d: HabitDraft): HabitDraft => ({ ...d, picked: [...d.picked], starred: [...d.starred], levels: { ...d.levels }, own: [...d.own], personal: [...d.personal] });

describe('EDIT_STEPS', () => {
  it('is the four categories in order, faith first, then Personal', () => {
    expect(EDIT_STEPS.map((s) => s.name)).toEqual(['Faith Rhythms', 'Hobbies', 'Tastes', 'Tech & Skills', 'Personal']);
    expect(EDIT_STEPS.map((s) => (s.kind === 'category' ? s.cat.key : s.kind))).toEqual([
      'faith',
      'hobbies',
      'tastes',
      'skills',
      'personal',
    ]);
    expect(PERSONAL_STEP).toBe(4);
  });
  it('drops Personal when topics could not be loaded', () => {
    expect(editSteps(true)).toHaveLength(5);
    expect(editSteps(false).map((s) => s.kind)).toEqual(['category', 'category', 'category', 'category']);
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
    expect(isDirty({ ...copy(start), personal: [] }, start)).toBe(true);
    expect(isDirty({ ...copy(start), personal: ['world war 2'] }, start)).toBe(false);
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

  it('sends a personal topic error to the Personal step, and skips it for the other problems', () => {
    expect(stepForError('personalTopics', ctx)).toBe(4);
    expect(stepForError('min', { ...ctx, picked: ['bible', 'hike', 'coffee', 'x'], categoryOf: () => 'faith' })).toBe(1);
    expect(stepForError('min', { ...ctx, picked: ['a'], categoryOf: () => 'faith', steps: editSteps(true), current: 4 })).toBe(1);
  });

  it('stays on the current step for other problems', () => {
    expect(stepForError('tags', ctx)).toBe(3);
  });
});

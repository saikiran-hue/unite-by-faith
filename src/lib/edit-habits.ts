import type { Level, PillarCategory } from '@/types/database';
import { CATS, type Cat } from '@/lib/cats';
import { ownChanged, type OwnHabit } from '@/components/OwnHabits';
import { topicsChanged } from '@/components/PersonalTopics';

/** One screen of the Edit Habits modal: a habit category, or the Personal topics. */
export type EditStep = { id: string; name: string; kind: 'category'; cat: Cat } | { id: 'personal'; name: string; kind: 'personal' };

/** The steps in order, faith first, Personal last. Every "of N" reads from the list in use (see editSteps). */
export const EDIT_STEPS: EditStep[] = [
  ...CATS.map((cat): EditStep => ({ id: cat.key, name: cat.name, kind: 'category', cat })),
  { id: 'personal', name: 'Personal', kind: 'personal' },
];

/** The steps to show: without Personal when personal topics could not be loaded. */
export const editSteps = (personalLoaded: boolean) =>
  personalLoaded ? EDIT_STEPS : EDIT_STEPS.filter((s) => s.kind !== 'personal');

/** Index of the Personal step in EDIT_STEPS (it is last, so category indexes are the same in both lists). */
export const PERSONAL_STEP = EDIT_STEPS.findIndex((s) => s.kind === 'personal');

/** What the modal edits. */
export interface HabitDraft {
  picked: string[];
  starred: string[];
  levels: Record<string, Level>;
  own: OwnHabit[];
  personal: string[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** True when the draft differs from the snapshot taken at open (order ignored; levels only for picked habits). */
export function isDirty(draft: HabitDraft, start: HabitDraft): boolean {
  return (
    !sameSet(draft.picked, start.picked) ||
    !sameSet(draft.starred, start.starred) ||
    draft.picked.some((s) => draft.levels[s] !== start.levels[s]) ||
    ownChanged(draft.own, start.own) ||
    topicsChanged(draft.personal, start.personal)
  );
}

/**
 * Which step (0-based) owns a save problem:
 * - 'min' (too few habits): the first step whose category has no picks;
 * - 'customTags' (server rejected own habits): the first step whose own habits differ from saved;
 * - 'personalTopics': the Personal step;
 * - anything else: stay on the current step.
 */
export function stepForError(
  problem: 'min' | 'customTags' | 'personalTopics' | string,
  ctx: {
    steps: EditStep[];
    current: number;
    picked: string[];
    categoryOf: (slug: string) => PillarCategory | undefined;
    own: OwnHabit[];
    savedOwn: OwnHabit[];
  }
): number {
  const { steps, current } = ctx;
  let i = -1;
  if (problem === 'min') {
    i = steps.findIndex((s) => s.kind === 'category' && !ctx.picked.some((slug) => ctx.categoryOf(slug) === s.cat.key));
  } else if (problem === 'customTags') {
    const inCat = (list: OwnHabit[], key: PillarCategory) => list.filter((o) => o.category === key);
    i = steps.findIndex((s) => s.kind === 'category' && ownChanged(inCat(ctx.own, s.cat.key), inCat(ctx.savedOwn, s.cat.key)));
    if (i < 0) i = steps.findIndex((s) => s.kind === 'category' && ctx.own.some((o) => o.category === s.cat.key));
  } else if (problem === 'personalTopics') {
    i = steps.findIndex((s) => s.kind === 'personal');
  }
  return i < 0 ? current : i;
}

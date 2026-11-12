import type { Level, PillarCategory } from '@/types/database';
import { CATS, type Cat } from '@/lib/cats';
import { ownChanged, type OwnHabit } from '@/components/OwnHabits';

/** One screen of the Edit Habits modal. Each step is a habit category for now; more kinds can be added. */
export type EditStep = { id: string; name: string; kind: 'category'; cat: Cat };

/** The steps in order, faith first. Append to add a step; every "of N" reads from this list's length. */
export const EDIT_STEPS: EditStep[] = CATS.map((cat) => ({ id: cat.key, name: cat.name, kind: 'category', cat }));

/** What the modal edits. */
export interface HabitDraft {
  picked: string[];
  starred: string[];
  levels: Record<string, Level>;
  own: OwnHabit[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** True when the draft differs from the snapshot taken at open (order ignored; levels only for picked habits). */
export function isDirty(draft: HabitDraft, start: HabitDraft): boolean {
  return (
    !sameSet(draft.picked, start.picked) ||
    !sameSet(draft.starred, start.starred) ||
    draft.picked.some((s) => draft.levels[s] !== start.levels[s]) ||
    ownChanged(draft.own, start.own)
  );
}

/**
 * Which step (0-based) owns a save problem:
 * - 'min' (too few habits): the first step whose category has no picks;
 * - 'customTags' (server rejected own habits): the first step whose own habits differ from saved;
 * - anything else: stay on the current step.
 */
export function stepForError(
  problem: 'min' | 'customTags' | string,
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
    i = steps.findIndex((s) => !ctx.picked.some((slug) => ctx.categoryOf(slug) === s.cat.key));
  } else if (problem === 'customTags') {
    const inCat = (list: OwnHabit[], key: PillarCategory) => list.filter((o) => o.category === key);
    i = steps.findIndex((s) => ownChanged(inCat(ctx.own, s.cat.key), inCat(ctx.savedOwn, s.cat.key)));
    if (i < 0) i = steps.findIndex((s) => ctx.own.some((o) => o.category === s.cat.key));
  }
  return i < 0 ? current : i;
}

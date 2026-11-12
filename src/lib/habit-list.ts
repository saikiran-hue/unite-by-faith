import type { PillarCategory, TaxonomyTag } from '@/types/database';

/** How many habits a category shows before "Show all". */
export const TOP_N = 12;

export interface HabitList {
  /** Collapsed view: the top habits by popularity, then any picks outside them. */
  shown: TaxonomyTag[];
  /** Expanded view: every offered habit (plus retired picks) by subgroup, in sort order. */
  groups: [string, TaxonomyTag[]][];
  /** How many habits the category offers. */
  total: number;
}

/**
 * The habits one category shows: top TOP_N by popularity then sort_order. Picks outside that list
 * (found by search, or since retired) stay visible so they can be changed.
 */
export function habitList(tags: TaxonomyTag[], category: PillarCategory, picked: string[]): HabitList {
  const inCat = tags.filter((t) => t.category === category);
  const active = inCat.filter((t) => t.is_active !== false);
  const top = [...active]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.sort_order - b.sort_order)
    .slice(0, TOP_N);
  const inTop = new Set(top.map((t) => t.slug));
  const extra = inCat.filter((t) => picked.includes(t.slug) && !inTop.has(t.slug));
  const groups = new Map<string, TaxonomyTag[]>();
  for (const t of [...active, ...extra.filter((t) => t.is_active === false)].sort((a, b) => a.sort_order - b.sort_order)) {
    const g = t.subgroup ?? '';
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  return { shown: [...top, ...extra], groups: [...groups], total: active.length };
}

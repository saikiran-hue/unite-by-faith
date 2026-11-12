import type { SupabaseClient } from '@supabase/supabase-js';
import type { PillarCategory } from '@/types/database';
import { embed } from './embed';
import { CUSTOM_MAP_MIN, normaliseQuery } from './suggest';
import { withCategory } from './tag-search';

const FETCH_K = 8;
const MAX_MAPPED = 2;

/** Up to 2 hits in `category` with raw cosine at or above `min`. Hits are assumed ordered best first. */
export function pickMapped(
  hits: { slug: string; cos: number }[],
  categoryOf: Map<string, string>,
  category: PillarCategory,
  min: number = CUSTOM_MAP_MIN,
): string[] {
  return hits
    .filter((h) => categoryOf.get(h.slug) === category && h.cos >= min)
    .slice(0, MAX_MAPPED)
    .map((h) => h.slug);
}

/** Top catalogue hits for each label (one batched embed call), plus each active slug's category. Throws on failure. */
export async function searchCustomLabels(
  admin: SupabaseClient,
  items: { category: PillarCategory; label: string }[],
): Promise<{ hits: { slug: string; cos: number }[][]; categoryOf: Map<string, string> }> {
  const { data: rows, error } = await admin.from('taxonomy_tags').select('slug, category').eq('is_active', true);
  if (error) throw new Error(`taxonomy_tags: ${error.message}`);
  const categoryOf = new Map((rows ?? []).map((r) => [r.slug as string, r.category as string]));
  const vecs = await embed(items.map((i) => normaliseQuery(i.label) ?? i.label.toLowerCase()));
  const hits: { slug: string; cos: number }[][] = [];
  for (let i = 0; i < items.length; i++) {
    // Filtered by category in SQL, so a crowded neighbouring category can't push same-category hits out of the top k.
    const { data, error: rpcErr } = await withCategory<{ slug: string; cos: number }>(
      admin,
      'search_tags_vector',
      { q: `[${Array.from(vecs[i]).join(',')}]`, k: FETCH_K },
      items[i].category,
    );
    if (rpcErr) throw new Error(`search_tags_vector: ${rpcErr.message}`);
    hits.push((data ?? []) as { slug: string; cos: number }[]);
  }
  return { hits, categoryOf };
}

/** Mapped slugs per label. Never throws: on any failure it logs and maps everything to nothing. */
export async function mapCustomLabels(
  admin: SupabaseClient,
  items: { category: PillarCategory; label: string }[],
): Promise<string[][]> {
  if (items.length === 0) return [];
  try {
    const { hits, categoryOf } = await searchCustomLabels(admin, items);
    return hits.map((h, i) => pickMapped(h, categoryOf, items[i].category));
  } catch (e) {
    console.error('custom tag mapping failed; storing no mapping', e);
    return items.map(() => []);
  }
}

const rowKey = (category: string, label: string) => `${category}:${label.trim().toLowerCase()}`;

/**
 * Which own habits keep their stored mapping and which need mapping now. A stored mapping is reused only
 * when it is non-empty: an empty one may mean the model failed last time, so it is tried again.
 */
export function planCustomRows<T extends { category: PillarCategory; label: string }>(
  custom: T[],
  existing: { category: string; label: string; mapped_slugs: string[] | null }[],
): { fresh: T[]; mappedFor: (c: T, freshMapped: string[][]) => string[] } {
  const stored = new Map(existing.map((r) => [rowKey(r.category, r.label), r.mapped_slugs ?? []]));
  const fresh = custom.filter((c) => !stored.get(rowKey(c.category, c.label))?.length);
  const freshIndex = new Map(fresh.map((c, i) => [rowKey(c.category, c.label), i]));
  return {
    fresh,
    mappedFor: (c, freshMapped) => {
      const i = freshIndex.get(rowKey(c.category, c.label));
      return i === undefined ? stored.get(rowKey(c.category, c.label)) ?? [] : freshMapped[i] ?? [];
    },
  };
}

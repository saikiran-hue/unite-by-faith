import type { PillarCategory } from '@/types/database';

/**
 * embedding column = raw normalised gte-small vectors, used only for query->tag retrieval with its own raw-cosine
 * threshold (calibrated in the tag-search task); tag_neighbors.sim = per-category mean-centred cosine, compared
 * only with neighborMin.
 * Minimum centred cosine for a related tag; calibrated in task-7-report.md. Keep in step with neighborMin in match_weights v1. */
export const NEIGHBOR_MIN = 0.25;

export function tagEmbeddingText(t: { label: string; description: string; synonyms: string[] }): string {
  const base = `${t.label}. ${t.description}.`;
  return t.synonyms.length ? `${base} Also: ${t.synonyms.join(', ')}` : base;
}

/**
 * Same-category nearest neighbours by cosine (vectors are expected normalised).
 * A pair is kept if it is in either tag's top-k above `min`, and is emitted in both directions.
 */
export function computeNeighbors(
  items: { slug: string; category: PillarCategory; vec: Float32Array }[],
  opts: { k: number; min: number } = { k: 10, min: NEIGHBOR_MIN },
): { a: string; b: string; sim: number }[] {
  const kept = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const scored: { j: number; sim: number }[] = [];
    for (let j = 0; j < items.length; j++) {
      if (j === i || items[j].category !== items[i].category) continue;
      let dot = 0;
      const x = items[i].vec;
      const y = items[j].vec;
      for (let d = 0; d < x.length; d++) dot += x[d] * y[d];
      if (dot >= opts.min) scored.push({ j, sim: dot });
    }
    scored.sort((p, q) => q.sim - p.sim || items[p.j].slug.localeCompare(items[q.j].slug));
    for (const { j, sim } of scored.slice(0, opts.k)) {
      kept.set(`${items[i].slug}\u0000${items[j].slug}`, sim);
      kept.set(`${items[j].slug}\u0000${items[i].slug}`, sim);
    }
  }
  return [...kept.entries()].map(([key, sim]) => {
    const [a, b] = key.split('\u0000');
    return { a, b, sim };
  });
}

/**
 * Subtracts each category's mean vector and re-normalises to unit length, which spreads out the
 * compressed cosines of a sentence-embedding model. A vector that is zero after centring
 * (e.g. a lone tag in its category) is returned as zeros, never NaN.
 */
export function centreByCategory<T extends { category: PillarCategory; vec: Float32Array }>(items: T[]): T[] {
  const sums = new Map<PillarCategory, { sum: Float64Array; n: number }>();
  for (const it of items) {
    const s = sums.get(it.category) ?? { sum: new Float64Array(it.vec.length), n: 0 };
    for (let d = 0; d < it.vec.length; d++) s.sum[d] += it.vec[d];
    s.n++;
    sums.set(it.category, s);
  }
  return items.map((it) => {
    const { sum, n } = sums.get(it.category)!;
    const out = new Float32Array(it.vec.length);
    let norm = 0;
    for (let d = 0; d < out.length; d++) {
      out[d] = it.vec[d] - sum[d] / n;
      norm += out[d] * out[d];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let d = 0; d < out.length; d++) out[d] /= norm;
    else out.fill(0);
    return { ...it, vec: out };
  });
}

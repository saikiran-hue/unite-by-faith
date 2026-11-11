import type { PillarCategory } from '@/types/database';

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
  opts: { k: number; min: number } = { k: 10, min: 0.6 },
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

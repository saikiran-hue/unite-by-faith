import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/gte-small';

/** Caches a loader's promise, but forgets it if it rejects so the next call retries. */
export function memoRetry<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) {
      const p = loader();
      cached = p;
      p.catch(() => {
        if (cached === p) cached = null;
      });
    }
    return cached;
  };
}

// Dynamic import keeps the model runtime out of any bundle that merely imports this file.
const load = memoRetry(() =>
  import('@huggingface/transformers').then(
    (m) => m.pipeline('feature-extraction', MODEL) as Promise<FeatureExtractionPipeline>,
  ),
);

/**
 * 384-dim gte-small embeddings, mean-pooled and L2-normalised. Server-side only.
 * These RAW vectors are what taxonomy_tags.embedding stores and what query->tag retrieval compares against
 * (raw cosine, own threshold). They are never mean-centred; centring is used only to build tag_neighbors.
 */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  const run = await load();
  const out = await run(texts, { pooling: 'mean', normalize: true });
  const dim = out.dims[1];
  const data = out.data as Float32Array;
  return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
}

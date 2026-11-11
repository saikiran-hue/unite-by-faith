import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/gte-small';
let extractor: Promise<FeatureExtractionPipeline> | null = null;

function load(): Promise<FeatureExtractionPipeline> {
  // Dynamic import keeps the model runtime out of any bundle that merely imports this file.
  extractor ??= import('@huggingface/transformers').then(
    (m) => m.pipeline('feature-extraction', MODEL) as Promise<FeatureExtractionPipeline>,
  );
  return extractor;
}

/** 384-dim gte-small embeddings, mean-pooled and L2-normalised. Server-side only. */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  const run = await load();
  const out = await run(texts, { pooling: 'mean', normalize: true });
  const dim = out.dims[1];
  const data = out.data as Float32Array;
  return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
}

/**
 * 384-dim gte-small embeddings, mean-pooled and L2-normalised. Server-side only.
 * Computed by the Supabase Edge Function `embed` (same model as ./embed-local, identical vectors), so the
 * app can run where a local model can't (Cloudflare Workers).
 * These RAW vectors are what taxonomy_tags.embedding stores and what query->tag retrieval compares against
 * (raw cosine, own threshold). They are never mean-centred; centring is used only to build tag_neighbors.
 */
const BATCH = 32;

export async function embed(texts: string[]): Promise<Float32Array[]> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embed`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('embed: SUPABASE_SERVICE_ROLE_KEY is not set');
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: texts.slice(i, i + BATCH) }),
    });
    if (!res.ok) throw new Error(`embed: function returned ${res.status}`);
    const { embeddings } = (await res.json()) as { embeddings: number[][] };
    out.push(...embeddings.map((e) => Float32Array.from(e)));
  }
  return out;
}

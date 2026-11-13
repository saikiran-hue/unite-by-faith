// gte-small embeddings for the app server (same model the app used locally, so stored vectors stay compatible).
// Only the app server may call it. The platform verifies the JWT signature (verify_jwt is on);
// here we also require the service_role claim, so the public anon key and member sessions are refused.
const session = new Supabase.ai.Session('gte-small');
const MAX_TEXTS = 32;
const MAX_CHARS = 500;

function jwtRole(header: string | null): string | null {
  const part = header?.replace(/^Bearer /, '').split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (jwtRole(req.headers.get('Authorization')) !== 'service_role') {
    return new Response('Forbidden', { status: 403 });
  }
  let texts: unknown;
  try {
    texts = (await req.json())?.texts;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS ||
      texts.some((t) => typeof t !== 'string' || t.length === 0 || t.length > MAX_CHARS)) {
    return new Response('Bad texts', { status: 400 });
  }
  const embeddings: number[][] = [];
  for (const t of texts as string[]) {
    embeddings.push((await session.run(t, { mean_pool: true, normalize: true })) as number[]);
  }
  return Response.json({ embeddings });
});

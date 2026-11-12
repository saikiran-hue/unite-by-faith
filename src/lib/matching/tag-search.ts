import type { SupabaseClient } from '@supabase/supabase-js';
import type { PillarCategory } from '@/types/database';

const CATEGORIES: readonly string[] = ['faith', 'hobbies', 'tastes', 'skills'];

/** null when no category was sent; undefined when one was sent but is not a known category. */
export function parseCategory(raw: string | null): PillarCategory | null | undefined {
  if (raw === null || raw === '') return null;
  return CATEGORIES.includes(raw) ? (raw as PillarCategory) : undefined;
}

/**
 * Calls a tag search RPC with the category filter (migration 0014), so the filter runs before the SQL limit.
 * Until 0014 is applied, the function has no `cat` argument (PostgREST PGRST202); then it retries without it,
 * and callers filter by category afterwards. Remove the fallback once 0014 is live everywhere.
 */
export async function withCategory<T>(
  admin: SupabaseClient,
  fn: 'search_tags_text' | 'search_tags_vector',
  args: Record<string, unknown>,
  cat: PillarCategory | null,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  if (!cat) return admin.rpc(fn, args) as never;
  const res = await admin.rpc(fn, { ...args, cat });
  if (res.error?.code === 'PGRST202') return admin.rpc(fn, args) as never;
  return res as never;
}

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCategory, withCategory } from './tag-search';

const fakeAdmin = (respond: (args: Record<string, unknown>) => { data: unknown; error: unknown }) => {
  const calls: Record<string, unknown>[] = [];
  const admin = {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      calls.push(args);
      return respond(args);
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
};

describe('parseCategory', () => {
  it('accepts the four categories, null when absent, undefined when unknown', () => {
    expect(parseCategory('hobbies')).toBe('hobbies');
    expect(parseCategory(null)).toBeNull();
    expect(parseCategory('')).toBeNull();
    expect(parseCategory('food')).toBeUndefined();
    expect(parseCategory("hobbies' or 1=1")).toBeUndefined();
  });
});

describe('withCategory', () => {
  it('passes cat to the RPC so SQL filters before its limit', async () => {
    const { admin, calls } = fakeAdmin(() => ({ data: [{ slug: 'home-brewing-tea-and-coffee', score: 0.5 }], error: null }));
    const res = await withCategory(admin, 'search_tags_text', { q: 'coffee' }, 'hobbies');
    expect(calls).toEqual([{ q: 'coffee', cat: 'hobbies' }]);
    expect(res.data).toHaveLength(1);
  });
  it('sends no cat when there is no category', async () => {
    const { admin, calls } = fakeAdmin(() => ({ data: [], error: null }));
    await withCategory(admin, 'search_tags_text', { q: 'coffee' }, null);
    expect(calls).toEqual([{ q: 'coffee' }]);
  });
  it('retries without cat when the function predates 0014', async () => {
    const { admin, calls } = fakeAdmin((a) =>
      a.cat ? { data: null, error: { code: 'PGRST202', message: 'not found' } } : { data: [], error: null },
    );
    const res = await withCategory(admin, 'search_tags_vector', { q: '[0]', k: 3 }, 'faith');
    expect(calls).toEqual([{ q: '[0]', k: 3, cat: 'faith' }, { q: '[0]', k: 3 }]);
    expect(res.error).toBeNull();
  });
  it('returns other errors as they are', async () => {
    const { admin, calls } = fakeAdmin(() => ({ data: null, error: { code: '42501', message: 'denied' } }));
    const res = await withCategory(admin, 'search_tags_text', { q: 'x' }, 'faith');
    expect(calls).toHaveLength(1);
    expect(res.error?.message).toBe('denied');
  });
});

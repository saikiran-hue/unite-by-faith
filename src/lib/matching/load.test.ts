import { describe, expect, it } from 'vitest';
import { fetchChunked, tzOffsetMinutes } from './load';

describe('fetchChunked', () => {
  it('returns every row across chunks and pages with no duplicates', async () => {
    const keys = Array.from({ length: 250 }, (_, i) => i);
    const perKey = 7; // 1750 rows total, more than one page and more than 1000
    const calls: number[] = [];
    const rows = await fetchChunked<{ k: number; n: number }, number>(
      keys,
      async (chunk, from, to) => {
        calls.push(chunk.length);
        const all = chunk.flatMap((k) => Array.from({ length: perKey }, (_, n) => ({ k, n })));
        return { data: all.slice(from, to + 1), error: null };
      },
      100,
      200,
    );
    expect(rows).toHaveLength(250 * perKey);
    expect(new Set(rows.map((r) => `${r.k}:${r.n}`)).size).toBe(250 * perKey);
    expect(Math.max(...calls)).toBeLessThanOrEqual(100);
  });

  it('stops on a short page and handles empty keys', async () => {
    expect(await fetchChunked([], async () => ({ data: [1], error: null }))).toEqual([]);
    let n = 0;
    await fetchChunked(['a'], async () => (n++, { data: [1, 2], error: null }), 100, 5);
    expect(n).toBe(1);
  });

  it('throws on a query error', async () => {
    await expect(fetchChunked(['a'], async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('tzOffsetMinutes', () => {
  const winter = new Date('2026-01-15T12:00:00Z');
  it('is 330 for Asia/Kolkata', () => expect(tzOffsetMinutes('Asia/Kolkata', winter)).toBe(330));
  it('is negative west of UTC', () => {
    expect(tzOffsetMinutes('America/New_York', winter)).toBe(-300);
    expect(tzOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
  });
  it('is 0 for UTC', () => expect(tzOffsetMinutes('UTC', winter)).toBe(0));
});

import { describe, expect, it, vi } from 'vitest';
import { memoRetry } from './embed-local';

describe('memoRetry', () => {
  it('retries after a rejection, then caches the success', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    const get = memoRetry(loader);
    await expect(get()).rejects.toThrow('boom');
    await expect(get()).resolves.toBe('ok');
    await expect(get()).resolves.toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

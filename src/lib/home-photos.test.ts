import { describe, expect, it } from 'vitest';
import { DUO_NEUTRAL, duoPhoto } from './home-photos';

describe('duoPhoto', () => {
  it('falls back to the neutral photo when gender is unset', () => {
    expect(duoPhoto(null)).toBe(DUO_NEUTRAL);
    expect(duoPhoto(undefined)).toBe(DUO_NEUTRAL);
  });
  it('falls back to the neutral photo when no photo exists for the gender', () => {
    expect(duoPhoto('man', {})).toBe(DUO_NEUTRAL);
    expect(duoPhoto('man', { woman: '/images/home/duo-women.jpg' })).toBe(DUO_NEUTRAL);
  });
  it('uses the gender photo when one exists', () => {
    expect(duoPhoto('woman', { woman: '/images/home/duo-women.jpg' })).toBe('/images/home/duo-women.jpg');
  });
});

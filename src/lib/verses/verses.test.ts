import { describe, expect, it } from 'vitest';
import { VERSES } from './data';
import { msToNextDay, verseFor, verseKey } from './index';

const all = Object.entries(VERSES);

describe('VERSES', () => {
  it('has one verse for every day of a leap year', () => {
    const days: string[] = [];
    for (let d = new Date(2024, 0, 1); d.getFullYear() === 2024; d.setDate(d.getDate() + 1)) days.push(verseKey(d));
    expect(Object.keys(VERSES).sort()).toEqual(days.sort());
    expect(days).toHaveLength(366);
  });

  it('never repeats a reference', () => expect(new Set(all.map(([, v]) => v.ref)).size).toBe(366));

  it('never repeats a text', () => expect(new Set(all.map(([, v]) => v.text)).size).toBe(366));

  it('keeps every verse whole and short', () => {
    for (const [key, v] of all) {
      expect(v.text.length, key).toBeGreaterThan(0);
      expect(v.text.length, key).toBeLessThanOrEqual(240);
      expect(v.text, key).not.toMatch(/\s{2}|\n/);
      let depth = 0;
      for (const ch of v.text) {
        if (ch === '“') depth++;
        if (ch === '”') depth--;
        expect(depth, key).toBeGreaterThanOrEqual(0);
      }
      expect(depth, key).toBe(0);
      expect(v.text, key).toMatch(/^[“A-Z]/);
      expect(v.text, key).toMatch(/[.!?]”?$/);
    }
  });
});

describe('verseKey and verseFor', () => {
  it('uses the local calendar date', () => {
    expect(verseKey(new Date(2026, 0, 1, 0, 30))).toBe('01-01');
    expect(verseKey(new Date(2026, 11, 31, 23, 59))).toBe('12-31');
    expect(verseFor(new Date(2024, 1, 29, 12))).toEqual(VERSES['02-29']);
    expect(verseFor(new Date(2026, 6, 4, 8))).toEqual(VERSES['07-04']);
    // Local getters, never UTC: this fails if verseKey calls getUTCMonth/getUTCDate.
    const d = new Date(Date.UTC(2026, 0, 1, 12));
    d.getMonth = () => 6;
    d.getDate = () => 4;
    expect(verseKey(d)).toBe('07-04');
  });
});

describe('msToNextDay', () => {
  it('counts down to the next local midnight', () => {
    expect(msToNextDay(new Date(2026, 4, 10, 23, 59, 30))).toBe(30_000);
    expect(msToNextDay(new Date(2026, 4, 10, 0, 0, 0))).toBe(86_400_000);
  });
});

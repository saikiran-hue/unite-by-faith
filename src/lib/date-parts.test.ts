import { describe, expect, it } from 'vitest';
import { clampDay, daysInMonth, toIsoDate } from './date-parts';

describe('date parts', () => {
  it('builds a zero-padded ISO date', () => {
    expect(toIsoDate({ day: '7', month: '3', year: '1998' })).toBe('1998-03-07');
  });
  it('returns empty until all three parts are picked', () => {
    expect(toIsoDate({ day: '7', month: '', year: '1998' })).toBe('');
  });
  it('rejects impossible dates', () => {
    expect(toIsoDate({ day: '29', month: '2', year: '2001' })).toBe('');
    expect(toIsoDate({ day: '31', month: '4', year: '2000' })).toBe('');
    expect(toIsoDate({ day: '29', month: '2', year: '2000' })).toBe('2000-02-29');
  });
  it('knows month lengths and leap years', () => {
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(11)).toBe(30);
  });
  it('clamps the day when the month gets shorter', () => {
    expect(clampDay({ day: '31', month: '2', year: '2003' })).toEqual({ day: '28', month: '2', year: '2003' });
    expect(clampDay({ day: '15', month: '2', year: '2003' }).day).toBe('15');
  });
});

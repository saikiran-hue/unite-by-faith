import { describe, expect, it } from 'vitest';
import { pickEmptyReason } from './empty-reason';

const rows = (total: number, c: Partial<Record<string, number>>) => [
  { rule: 'age', passing: c.age ?? total },
  { rule: 'language', passing: c.language ?? total },
  { rule: 'place', passing: c.place ?? total },
  { rule: 'gender', passing: c.gender ?? total },
  { rule: 'tradition', passing: c.tradition ?? total },
  { rule: 'total', passing: total },
];

describe('pickEmptyReason', () => {
  it('nobody in the pool: no rule is blamed', () => {
    expect(pickEmptyReason(rows(0, {}))).toBeNull();
  });

  it('blames the narrowest rule when nobody passes it', () => {
    expect(pickEmptyReason(rows(5, { place: 0, age: 2 }))).toEqual({ rule: 'place', passing: 0 });
  });

  it('ties at zero go to the first rule in order', () => {
    expect(pickEmptyReason(rows(5, { tradition: 0, language: 0 }))).toEqual({ rule: 'language', passing: 0 });
  });

  it('every rule passes someone (only the combination fails): generic copy', () => {
    expect(pickEmptyReason(rows(5, { age: 1, place: 2 }))).toBeNull();
  });

  it('pods: no open pods means no reason even when a rule passes nobody', () => {
    expect(pickEmptyReason(rows(0, { age: 0 }))).toBeNull();
  });

  it('a missing total row is treated as an empty pool', () => {
    expect(pickEmptyReason([{ rule: 'age', passing: 0 }])).toBeNull();
  });
});

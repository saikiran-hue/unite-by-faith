export const RULE_ORDER = ['age', 'language', 'place', 'gender', 'tradition'];

export interface FilterCount {
  rule: string;
  passing: number;
}

/**
 * The rule to blame for an empty result: the narrowest rule, but only when nobody passes it
 * and the pool before any rule (the 'total' row) is not empty. Otherwise null (generic copy).
 */
export function pickEmptyReason(rows: FilterCount[]): FilterCount | null {
  const total = rows.find((r) => r.rule === 'total')?.passing ?? 0;
  if (total <= 0) return null;
  const narrowest = rows
    .filter((r) => RULE_ORDER.includes(r.rule))
    .sort((a, b) => a.passing - b.passing || RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule))[0];
  if (!narrowest || narrowest.passing !== 0) return null;
  return { rule: narrowest.rule, passing: narrowest.passing };
}

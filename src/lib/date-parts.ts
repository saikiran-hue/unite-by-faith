export interface DateParts {
  day: string;
  month: string; // 1-12
  year: string;
}

export const EMPTY_DATE_PARTS: DateParts = { day: '', month: '', year: '' };

/** Days in a month (1-12); February counts 29 only in a leap year. Unknown year: 29, so the 29th stays pickable. */
export function daysInMonth(month: number, year?: number): number {
  if (month === 2) {
    if (!year) return 29;
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** YYYY-MM-DD when all three parts make a real date, otherwise ''. */
export function toIsoDate(p: DateParts): string {
  const d = Number(p.day), m = Number(p.month), y = Number(p.year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return '';
  if (m < 1 || m > 12 || y < 1000 || d < 1 || d > daysInMonth(m, y)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Keeps the chosen day valid after the month or year changes (31 Jan -> Feb becomes 28/29). */
export function clampDay(p: DateParts): DateParts {
  if (!p.day || !p.month) return p;
  const max = daysInMonth(Number(p.month), p.year ? Number(p.year) : undefined);
  return Number(p.day) > max ? { ...p, day: String(max) } : p;
}

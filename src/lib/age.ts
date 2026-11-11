const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses an ISO `YYYY-MM-DD` string into calendar fields. Throws on anything that is not a real date. */
function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Invalid birth date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid birth date: ${value}`);
  }
  return { year, month, day };
}

/**
 * Whole years between `birthDate` and `today`, counted by calendar date.
 * Uses UTC calendar fields, so `new Date('2026-11-11')` is 11 November everywhere.
 */
export function ageOn(birthDate: string, today: Date): number {
  const birth = parseIsoDate(birthDate);
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth() + 1;
  const todayDay = today.getUTCDate();

  let age = todayYear - birth.year;
  if (todayMonth < birth.month || (todayMonth === birth.month && todayDay < birth.day)) {
    age -= 1;
  }
  return age;
}

/** True once the person has reached 18 on `today`. */
export function isAdult(birthDate: string, today: Date): boolean {
  return ageOn(birthDate, today) >= 18;
}

/** Default partner age range: six years either side of `age`, never below 18. */
export function defaultAgeRange(age: number): { min: number; max: number } {
  return { min: Math.max(18, age - 6), max: age + 6 };
}

import { ageOn, isAdult } from './age';

/** The part of a Supabase auth user the age gate reads. */
export interface AgeGateUser {
  app_metadata?: Record<string, unknown> | null;
}

/**
 * Google sign-in never gives us a birth date, so a Google account must confirm it is 18+
 * once (`app_metadata.age_verified`, set only by the server) before using the app.
 * Password accounts (demo and local test users) gave a birth date at sign-up.
 */
export function needsAgeCheck(user: AgeGateUser): boolean {
  const m = user.app_metadata ?? {};
  return m.provider === 'google' && m.age_verified !== true;
}

export type BirthCheck =
  | { ok: true; birthDate: string; age: number }
  | { ok: false; underage: boolean; message: string };

const BAD_BIRTH_DATE = 'Enter your real date of birth.';
export const UNDERAGE_MESSAGE = 'You need to be 18 or older to join Unite by Faith.';

/** Validates a YYYY-MM-DD birth date against `today` (read via its UTC fields). */
export function checkBirthDate(value: unknown, today: Date): BirthCheck {
  const birthDate = typeof value === 'string' ? value.trim() : '';
  let age: number;
  try {
    age = ageOn(birthDate, today);
  } catch {
    return { ok: false, underage: false, message: BAD_BIRTH_DATE };
  }
  if (age < 0) return { ok: false, underage: false, message: BAD_BIRTH_DATE };
  if (!isAdult(birthDate, today)) return { ok: false, underage: true, message: UNDERAGE_MESSAGE };
  return { ok: true, birthDate, age };
}

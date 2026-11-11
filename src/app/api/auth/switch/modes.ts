import { ageOn, isAdult } from '@/lib/age';

export type SignupField = 'birthDate' | 'email' | 'fullName' | 'password';

export type SignupResult =
  | {
      ok: true;
      value: { fullName: string; email: string; password: string; birthDate: string };
    }
  | { ok: false; field: SignupField; message: string };

const BAD_BIRTH_DATE = 'Enter your real date of birth.';

/** Checks the sign-up body. `today` is the user's calendar date, read via its UTC fields. */
export function validateSignup(body: unknown, today: Date): SignupResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const fullName = typeof b.fullName === 'string' ? b.fullName.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const birthDate = typeof b.birthDate === 'string' ? b.birthDate.trim() : '';

  if (!fullName) return { ok: false, field: 'fullName', message: 'Enter your full name.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, field: 'email', message: 'Enter a valid email, like you@example.com.' };
  }
  if (password.trim().length < 6) {
    return { ok: false, field: 'password', message: 'Use at least 6 characters.' };
  }

  let age: number;
  try {
    age = ageOn(birthDate, today);
  } catch {
    return { ok: false, field: 'birthDate', message: BAD_BIRTH_DATE };
  }
  if (age < 0) return { ok: false, field: 'birthDate', message: BAD_BIRTH_DATE };
  if (!isAdult(birthDate, today)) {
    return {
      ok: false,
      field: 'birthDate',
      message: 'You need to be 18 or older to join Unite by Faith.',
    };
  }

  return { ok: true, value: { fullName, email, password, birthDate } };
}

const DAY_MS = 86_400_000;

/**
 * The user's calendar date for the age check. The client sends its local date
 * as YYYY-MM-DD; it is trusted only within one day of the server's UTC date.
 */
export function resolveToday(clientToday: unknown, serverNow: Date): Date {
  const serverDay = new Date(
    Date.UTC(serverNow.getUTCFullYear(), serverNow.getUTCMonth(), serverNow.getUTCDate())
  );
  if (typeof clientToday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(clientToday)) {
    return serverDay;
  }
  const client = new Date(`${clientToday}T00:00:00Z`);
  if (Number.isNaN(client.getTime()) || client.toISOString().slice(0, 10) !== clientToday) {
    return serverDay;
  }
  return Math.abs(client.getTime() - serverDay.getTime()) <= DAY_MS ? client : serverDay;
}

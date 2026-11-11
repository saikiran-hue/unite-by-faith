import { describe, expect, it } from 'vitest';
import { resolveToday, validateSignup } from './modes';

const TODAY = new Date('2026-11-11');
const base = {
  fullName: 'Priya Mathew',
  email: 'Priya@Example.com ',
  password: 'secret1',
  birthDate: '1981-03-04',
};

describe('validateSignup', () => {
  it('accepts a 45-year-old and normalises the email', () => {
    const r = validateSignup(base, TODAY);
    expect(r).toEqual({
      ok: true,
      value: { fullName: 'Priya Mathew', email: 'priya@example.com', password: 'secret1', birthDate: '1981-03-04' },
    });
  });

  it('refuses someone under 18', () => {
    expect(validateSignup({ ...base, birthDate: '2009-11-12' }, TODAY)).toEqual({
      ok: false,
      field: 'birthDate',
      message: 'You need to be 18 or older to join Unite by Faith.',
    });
  });

  it('accepts someone turning 18 today', () => {
    expect(validateSignup({ ...base, birthDate: '2008-11-11' }, TODAY).ok).toBe(true);
  });

  it('refuses a future birth date', () => {
    expect(validateSignup({ ...base, birthDate: '2027-01-01' }, TODAY)).toEqual({
      ok: false,
      field: 'birthDate',
      message: 'Enter your real date of birth.',
    });
  });

  it('refuses an unparseable or missing birth date', () => {
    for (const birthDate of ['not-a-date', '2020-02-31', '', undefined]) {
      expect(validateSignup({ ...base, birthDate }, TODAY)).toEqual({
        ok: false,
        field: 'birthDate',
        message: 'Enter your real date of birth.',
      });
    }
  });

  it('requires a password with no default fallback', () => {
    const { password: _omit, ...rest } = base;
    void _omit;
    expect(validateSignup(rest, TODAY)).toMatchObject({ ok: false, field: 'password' });
    expect(validateSignup({ ...base, password: '12345' }, TODAY)).toMatchObject({ ok: false, field: 'password' });
  });

  it('requires a name and a valid email', () => {
    expect(validateSignup({ ...base, fullName: '  ' }, TODAY)).toMatchObject({ ok: false, field: 'fullName' });
    expect(validateSignup({ ...base, email: 'nope' }, TODAY)).toMatchObject({ ok: false, field: 'email' });
  });
});

describe('resolveToday', () => {
  const now = new Date('2026-11-11T23:30:00Z');

  it('uses the client date when it is the server date', () => {
    expect(resolveToday('2026-11-11', now).toISOString().slice(0, 10)).toBe('2026-11-11');
  });

  it('uses the client date one day ahead or behind', () => {
    expect(resolveToday('2026-11-12', now).toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(resolveToday('2026-11-10', now).toISOString().slice(0, 10)).toBe('2026-11-10');
  });

  it('falls back to the server UTC date beyond one day or when malformed', () => {
    for (const v of ['2026-11-14', '2020-01-01', 'garbage', '', undefined, 5]) {
      expect(resolveToday(v, now).toISOString().slice(0, 10)).toBe('2026-11-11');
    }
  });
});

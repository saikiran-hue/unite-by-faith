'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertBox, Btn, Icon, Rose, ThemeButton } from '@/components/ubf';

/** The user's own calendar date as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AgeCheckPage() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState('');
  // Set after mount: reading the clock during render is not allowed here.
  const [maxBirth, setMaxBirth] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [underage, setUnderage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMaxBirth(localToday()));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFailure(null);
    if (!birthDate) {
      setError('Enter your date of birth.');
      document.getElementById('age-birth')?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/age', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, today: localToday() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
      if (data.underage) {
        setUnderage(data.error);
        return;
      }
      if (!res.ok) {
        if (data.field === 'birthDate') {
          setError(data.error);
          document.getElementById('age-birth')?.focus();
        } else {
          setFailure(data.error || 'Something went wrong.');
        }
        return;
      }
      router.replace(data.next || '/onboarding');
      router.refresh();
    } catch {
      setFailure('We couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function switchGoogleAccount() {
    await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'signout' }),
    }).catch(() => {});
    router.replace('/auth');
  }

  return (
    <div className="auth">
      <section className="auth-form" style={{ gridColumn: '1 / -1' }}>
        <div className="auth-tools">
          <ThemeButton />
        </div>
        <div className="card auth-card">
          <span className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Rose size={28} />
            <b>Unite by Faith</b>
          </span>
          {underage ? (
            <>
              <h1 className="h2">Thanks for your interest</h1>
              <p className="sub" style={{ marginBottom: 20 }}>
                {underage} We’ve removed the account we just started, so nothing about you is kept.
              </p>
              <Btn variant="btn-amber block" onClick={() => router.replace('/auth')}>
                Back to Sign In
              </Btn>
            </>
          ) : (
            <>
              <h1 className="h2">One quick check</h1>
              <p className="sub" style={{ marginBottom: 20 }}>
                Unite by Faith is for people 18 and older. We ask once, keep it private and use it only to match
                you with people near your age.
              </p>
              <form className="form" onSubmit={handleSubmit} noValidate>
                {failure && <AlertBox title="We couldn’t save that." text={failure} />}
                <div className="field">
                  <label htmlFor="age-birth">Date of Birth</label>
                  <span className="hint" id="age-birth-h">
                    Only you can see this.
                  </span>
                  <input
                    className="input"
                    id="age-birth"
                    type="date"
                    autoComplete="bday"
                    value={birthDate}
                    max={maxBirth}
                    onChange={(e) => setBirthDate(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'age-birth-e' : 'age-birth-h'}
                  />
                  {error && (
                    <span className="err" id="age-birth-e" role="alert">
                      <Icon name="alert" />
                      {error}
                    </span>
                  )}
                </div>
                <Btn type="submit" variant="btn-amber block" busy={submitting} busyLabel="Checking…">
                  Continue
                </Btn>
              </form>
              <p className="small" style={{ marginTop: 14, textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-text"
                  style={{ minHeight: 44, padding: '0 4px' }}
                  onClick={switchGoogleAccount}
                >
                  Use a different Google account
                </button>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

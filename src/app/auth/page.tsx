'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile } from '@/types/database';
import { AlertBox, Btn, Icon, Rose, ThemeButton } from '@/components/ubf';
import { CATS } from '@/lib/cats';
import { PHOTOS, VERSES } from '@/lib/sample-content';

type Mode = 'signup' | 'signin';
type FieldId = 'name' | 'email' | 'password' | 'birth';
type DemoProfile = Pick<UserProfile, 'id' | 'full_name' | 'avatar_url' | 'headline'>;

const SERVER_FIELDS: Record<string, FieldId> = {
  fullName: 'name',
  email: 'email',
  password: 'password',
  birthDate: 'birth',
};

/** The user's own calendar date as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
type Errors = Partial<Record<FieldId, string>>;

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  // Set after mount: reading the clock during render is not allowed here.
  const [maxBirth, setMaxBirth] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);

  const [allProfiles, setAllProfiles] = useState<DemoProfile[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const create = mode === 'signup';
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ signup: null, signin: null });
  const focusTab = useRef<Mode | null>(null);
  const focusField = useRef<FieldId | null>(null);

  useEffect(() => {
    queueMicrotask(() => setMaxBirth(localToday()));
    fetch('/api/auth/demo-profiles')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DemoProfile[]) => setAllProfiles(list))
      .catch(() => {});
  }, []);

  // Move focus after a render, as the prototype's render(focusSel) does.
  useEffect(() => {
    if (focusTab.current) {
      tabRefs.current[focusTab.current]?.focus({ preventScroll: true });
      focusTab.current = null;
    }
    if (focusField.current) {
      document.getElementById(`au-${focusField.current}`)?.focus({ preventScroll: true });
      focusField.current = null;
    }
  });

  function selectTab(next: Mode) {
    setMode(next);
    setFullName('');
    setEmail('');
    setPassword('');
    setBirthDate('');
    setErrors({});
    setFailure(null);
    focusTab.current = next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFailure(null);

    const next: Errors = {};
    if (create && !fullName.trim()) next.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email, like you@example.com.';
    if (password.trim().length < 6)
      next.password = create ? 'Use at least 6 characters.' : 'Enter your password. It has at least 6 characters.';
    if (create && !birthDate) next.birth = 'Enter your date of birth.';
    setErrors(next);
    const first = (['name', 'email', 'birth', 'password'] as const).find((k) => next[k]);
    if (first) {
      focusField.current = first;
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          fullName,
          email,
          password,
          birthDate,
          today: localToday(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldId = typeof data.field === 'string' ? SERVER_FIELDS[data.field] : undefined;
        if (fieldId) {
          setErrors({ [fieldId]: data.error });
          focusField.current = fieldId;
          return;
        }
        setFailure(
          create
            ? {
                title: 'We couldn’t create your account.',
                text: `${data.error || 'Authentication failed'}. Check your details and try again, or sign in if you already have an account.`,
              }
            : {
                title: 'That email and password don’t match.',
                text: 'Check both and try again, or create an account if you are new.',
              }
        );
        return;
      }

      if (mode === 'signup' || !data.onboardingCompleted) {
        router.replace('/onboarding');
      } else {
        router.replace('/');
      }
      router.refresh();
    } catch (err) {
      setFailure({
        title: 'We couldn’t reach the server.',
        text: `${err instanceof Error ? err.message : 'Network error'}. Check your connection and try again.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickSwitch(userId: string) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'demo', userId }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function field(
    id: FieldId,
    label: string,
    type: string,
    placeholder: string,
    hint: string,
    autoComplete: string,
    value: string,
    onChange: (v: string) => void,
    max?: string
  ) {
    const err = errors[id];
    return (
      <div className="field">
        <label htmlFor={`au-${id}`}>{label}</label>
        {hint && (
          <span className="hint" id={`au-${id}-h`}>
            {hint}
          </span>
        )}
        <input
          className="input"
          id={`au-${id}`}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `au-${id}-e` : hint ? `au-${id}-h` : undefined}
        />
        {err && (
          <span className="err" id={`au-${id}-e`} role="alert">
            <Icon name="alert" />
            {err}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="auth">
      <section className="auth-photo on-dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTOS.hero} alt="" />
        <div className="auth-copy">
          <span className="brand">
            <Rose size={36} />
            <span>Unite by Faith</span>
          </span>
          <h1 className="intro" aria-label="Find Christ-centered friends.">
            <span className="w" style={{ '--i': 0 } as React.CSSProperties}>
              Find
            </span>{' '}
            <span className="w" style={{ '--i': 1 } as React.CSSProperties}>
              Christ-centered
            </span>{' '}
            <span className="w" style={{ '--i': 2 } as React.CSSProperties}>
              friends.
            </span>
          </h1>
          <p>We match on faith first, then on the everyday things you love.</p>
          <ul className="chips">
            {CATS.map((c) => (
              <li key={c.key} className={`chip cat-${c.key}`}>
                <Icon name={c.icon} />
                {c.short}
                {c.key === 'faith' && (
                  <>
                    {' '}
                    <span className="tag core">Core</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <blockquote className="verse">
            “{VERSES.hero.text}”<cite>{VERSES.hero.ref}</cite>
          </blockquote>
        </div>
      </section>

      <section className="auth-form">
        <div className="auth-tools">
          <ThemeButton />
        </div>
        <div className="card auth-card">
          <div className="tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={create}
              ref={(el) => {
                tabRefs.current.signup = el;
              }}
              onClick={() => selectTab('signup')}
            >
              Create Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!create}
              ref={(el) => {
                tabRefs.current.signin = el;
              }}
              onClick={() => selectTab('signin')}
            >
              Sign In
            </button>
          </div>
          <h2 className="h2">{create ? 'Create Your Account' : 'Welcome Back'}</h2>
          <p className="sub" style={{ marginBottom: 16 }}>
            {create ? 'It takes a minute. Next you will pick your habits.' : 'Sign in to see your matches and chats.'}
          </p>
          <form className="form" onSubmit={handleSubmit} noValidate>
            {failure && <AlertBox title={failure.title} text={failure.text} />}
            {create && field('name', 'Full Name', 'text', 'e.g. Priya Mathew', '', 'name', fullName, setFullName)}
            {field('email', 'Email', 'email', 'you@example.com', '', 'email', email, setEmail)}
            {create &&
              field(
                'birth',
                'Date of Birth',
                'date',
                '',
                'You must be 18 or older. We keep this private.',
                'bday',
                birthDate,
                setBirthDate,
                maxBirth
              )}
            {field(
              'password',
              'Password',
              'password',
              '',
              create ? 'At least 6 characters.' : '',
              create ? 'new-password' : 'current-password',
              password,
              setPassword
            )}
            <Btn
              type="submit"
              variant={create ? 'btn-amber block' : 'btn-indigo block'}
              busy={submitting}
              busyLabel={create ? 'Creating Account…' : 'Signing In…'}
            >
              {create ? 'Create Account' : 'Sign In'}
            </Btn>
          </form>
          <p className="small" style={{ marginTop: 14, textAlign: 'center' }}>
            {create ? 'Already have an account?' : 'New here?'}{' '}
            <button
              type="button"
              className="btn btn-text"
              style={{ minHeight: 44, padding: '0 4px' }}
              onClick={() => selectTab(create ? 'signin' : 'signup')}
            >
              {create ? 'Sign In' : 'Create Account'}
            </button>
          </p>
        </div>

        {allProfiles.length > 0 && (
          <Btn
            variant="btn-text"
            icon="users"
            aria-expanded={switcherOpen}
            aria-controls="sw"
            onClick={() => setSwitcherOpen((o) => !o)}
          >
            {switcherOpen ? 'Hide Demo Members' : 'Try It as Another Member'}
          </Btn>
        )}
        {allProfiles.length > 0 && switcherOpen && (
          <section className="card auth-card" id="sw" style={{ padding: 0 }} aria-labelledby="sw-h">
            <div className="list-head">
              <h2 className="h3" id="sw-h">
                Switch Profile
              </h2>
            </div>
            <ul className="list">
              {allProfiles.map((prof) => {
                return (
                  <li key={prof.id}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleQuickSwitch(prof.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="avatar" src={prof.avatar_url} width={44} height={44} alt="" />
                      <span className="grow">
                        <b className="trunc">{prof.full_name}</b>
                        <span className="small trunc" style={{ display: 'block' }}>
                          {prof.headline}
                        </span>
                      </span>
                      <span className="go">
                        <Icon name="right" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
}

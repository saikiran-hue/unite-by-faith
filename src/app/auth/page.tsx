'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile } from '@/types/database';
import { AlertBox, Btn, Icon, Rose, Spinner, ThemeButton } from '@/components/ubf';
import { CATS } from '@/lib/cats';
import { PHOTOS, VERSES } from '@/lib/sample-content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type DemoProfile = Pick<UserProfile, 'id' | 'full_name' | 'avatar_url' | 'headline'>;

/** Shown when Google or the callback sends the user back with ?error=. */
const RETURN_ERRORS: Record<string, { title: string; text: string }> = {
  google: {
    title: 'Google sign-in didn’t finish.',
    text: 'Try again. If it keeps happening, check that pop-ups and cookies are allowed for this site.',
  },
  setup: {
    title: 'We signed you in but couldn’t set up your profile.',
    text: 'Try again in a moment.',
  },
};

/** Google's "G" mark, as the sign-in branding guidelines require. */
function GoogleMark() {
  return (
    <svg className="g-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);
  const [allProfiles, setAllProfiles] = useState<DemoProfile[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) queueMicrotask(() => setFailure(RETURN_ERRORS[code] ?? RETURN_ERRORS.google));
    // Local development only: the route answers 404 in production, so the list stays hidden.
    if (process.env.NODE_ENV !== 'production') {
      fetch('/api/auth/demo-profiles')
        .then((r) => (r.ok ? r.json() : []))
        .then((list: DemoProfile[]) => setAllProfiles(list))
        .catch(() => {});
    }
  }, []);

  async function handleGoogle() {
    if (redirecting) return;
    setFailure(null);
    setRedirecting(true);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setRedirecting(false);
      setFailure({ title: 'We couldn’t open Google sign-in.', text: `${error.message}. Try again.` });
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
          <h2 className="h2">Welcome to Unite by Faith</h2>
          <p className="sub" style={{ marginBottom: 20 }}>
            Sign in with your Google account. New here? The same button creates your account.
          </p>
          <div className="form">
            {failure && <AlertBox title={failure.title} text={failure.text} />}
            <button
              type="button"
              className="btn btn-google block"
              onClick={handleGoogle}
              aria-busy={redirecting || undefined}
              disabled={redirecting}
            >
              {redirecting ? <Spinner /> : <GoogleMark />}
              {redirecting ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <p className="small" style={{ textAlign: 'center' }}>
              We only get your name, email and photo from Google.
            </p>
          </div>
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

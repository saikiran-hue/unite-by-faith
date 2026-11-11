'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AlertBox, Btn, CatHead, HabitChips, Icon, sortHabits, type IconName } from '@/components/ubf';
import { CATS } from '@/lib/cats';
import { FellowshipMode, TaxonomyTag, UserProfile } from '@/types/database';

const STEPS = ['About You', 'Faith & Hobbies', 'Tastes, Tech & Skills'];
const MODES: { mode: FellowshipMode; title: string; desc: string; icon: IconName }[] = [
  { mode: 'both', title: 'Pods + 1v1 Duos', desc: 'Open to groups and one-to-one friends.', icon: 'users' },
  { mode: 'group_only', title: 'Fellowship Pods Only', desc: 'Small circles of 3 to 4 people.', icon: 'users' },
  { mode: 'duo_only', title: '1v1 Duo Only', desc: 'One friend at a time.', icon: 'user' },
];
const TRADITIONS = [
  'Evangelical',
  'Baptist',
  'Catholic',
  'Church of South India',
  'Mar Thoma',
  'Methodist',
  'Orthodox',
  'Pentecostal',
  'Non-denominational',
  'Other',
];
const SEASONS = ['Exploring', 'New Believer', 'Growing Deeper', 'Serving & Leading'];
const MIN_HABITS = 3;
const MAX_STARRED = 3;

/** Option list from the design, plus the stored value if it is not in it, so saving never changes it unseen. */
function withStored(opts: string[], value: string) {
  return value && !opts.includes(value) ? [value, ...opts] : opts;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<[string, string, { label: string; onClick: () => void }?] | null>(null);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [taxonomyTags, setTaxonomyTags] = useState<TaxonomyTag[]>([]);

  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [denomination, setDenomination] = useState(TRADITIONS[0]);
  const [church, setChurch] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [yearsInFaith, setYearsInFaith] = useState('Growing Deeper');
  const [fellowshipMode, setFellowshipMode] = useState<FellowshipMode>('both');
  const [picked, setPicked] = useState<string[]>([]);
  const [starred, setStarred] = useState<string[]>([]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  function fillFrom(u: UserProfile | null) {
    setFullName(u?.full_name ?? '');
    setHeadline(u?.headline ?? '');
    setBio(u?.bio ?? '');
    setDenomination(u?.denomination_or_tradition || TRADITIONS[0]);
    setChurch(u?.church_or_fellowship ?? '');
    setLocationCity(u?.location_city ?? '');
    setYearsInFaith(u?.years_in_faith || 'Growing Deeper');
    setFellowshipMode(u?.fellowship_mode || 'both');
    setPicked(u?.tags.map((t) => t.tag_slug) ?? []);
    setStarred(u?.tags.filter((t) => t.is_priority).map((t) => t.tag_slug) ?? []);
  }

  const loadInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (res.ok && data.currentUser) {
        const u: UserProfile = data.currentUser;
        setCurrentUser(u);
        setTaxonomyTags(
          [...((data.taxonomyTags || []) as TaxonomyTag[])].sort((a, b) => a.sort_order - b.sort_order)
        );
        setStep(1);
        setError(null);
        fillFrom(u);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (focusHeading.current) headingRef.current?.focus();
    focusHeading.current = false;
  }, [step]);

  const tagMap = useMemo(() => new Map(taxonomyTags.map((t) => [t.slug, t])), [taxonomyTags]);

  function goStep(n: number) {
    focusHeading.current = true;
    setStep(n);
    setError(null);
  }

  function toggle(slug: string) {
    if (picked.includes(slug)) {
      setPicked(picked.filter((s) => s !== slug));
      setStarred(starred.filter((s) => s !== slug));
    } else {
      setPicked([...picked, slug]);
    }
    setError(null);
  }

  function star(slug: string) {
    if (starred.includes(slug)) setStarred(starred.filter((s) => s !== slug));
    else if (starred.length < MAX_STARRED) setStarred([...starred, slug]);
  }

  const first = !currentUser?.onboarding_completed;
  const finishLabel = first ? 'Finish Setup' : 'Save Profile';

  async function finish() {
    const n = picked.length;
    if (n < MIN_HABITS) {
      setError([
        'Pick at least 3 habits.',
        `You have ${n}. Go back to Faith & Hobbies or add ${MIN_HABITS - n} more here, then save.`,
      ]);
      return;
    }
    if (!fullName.trim()) {
      setError([
        'Add your name.',
        `Your name is empty. Tap Go to About You, fill in Name, then tap ${finishLabel}.`,
        { label: 'Go to About You', onClick: () => goStep(1) },
      ]);
      return;
    }

    const failed: [string, string] = [
      'We couldn’t save your profile.',
      `Your details are still here. Check your connection and tap ${finishLabel} again.`,
    ];
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          headline,
          bio,
          denomination,
          church,
          locationCity,
          yearsInFaith,
          fellowshipMode,
          // Without this the server resets the photo to its default.
          avatarUrl: currentUser?.avatar_url,
          selectedTags: picked.map((slug) => ({
            slug,
            category: tagMap.get(slug)?.category ?? 'faith',
            isPriority: starred.includes(slug),
          })),
        }),
      });
      if (!res.ok) {
        setError(failed);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError(failed);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell currentUser={null}>
        <main className="wrap stack">
          <section className="card pad" aria-busy="true">
            <p className="sr" role="status">
              Loading your profile…
            </p>
            <div style={{ display: 'grid', gap: 12 }} aria-hidden="true">
              <span className="skel" style={{ height: 20, width: '30%' }} />
              <span className="skel" style={{ height: 14, width: '55%' }} />
              <span className="skel" style={{ height: 120, borderRadius: 18 }} />
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  const counterText = `${picked.length} picked, ${starred.length} of 3 starred`;
  const starredSet = new Set(starred);
  const starFull = starred.length >= MAX_STARRED;
  const mode = MODES.find((m) => m.mode === fellowshipMode) ?? MODES[0];

  function field(id: string, label: string, value: string, set: (v: string) => void, ph?: string, opts?: string[]) {
    return (
      <div className="field">
        <label htmlFor={`pf-${id}`}>{label}</label>
        {opts ? (
          <select className="input" id={`pf-${id}`} value={value} onChange={(e) => set(e.target.value)}>
            {opts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            id={`pf-${id}`}
            value={value}
            placeholder={ph}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </div>
    );
  }

  let body: React.ReactNode;
  if (step === 1) {
    body = (
      <div className="form">
        <div className="two">
          {field('name', 'Name', fullName, setFullName)}
          {field('headline', 'Headline', headline, setHeadline, 'e.g. Teacher who loves long runs')}
        </div>
        <div className="two">
          {field('trad', 'Tradition or Denomination', denomination, setDenomination, '', withStored(TRADITIONS, denomination))}
          {field('city', 'City', locationCity, setLocationCity, 'e.g. Bengaluru')}
        </div>
        <div className="two">
          {field('church', 'Church', church, setChurch, 'Where you worship, if you have one')}
          {field('season', 'Season in Faith', yearsInFaith, setYearsInFaith, '', withStored(SEASONS, yearsInFaith))}
        </div>
        <div className="field">
          <label htmlFor="pf-intro">Short Intro</label>
          <span className="hint">Two or three lines people see on your match card.</span>
          <textarea
            className="input"
            id="pf-intro"
            placeholder="What are you hoping to find here?"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
      </div>
    );
  } else {
    const cats = step === 2 ? CATS.slice(0, 2) : CATS.slice(2);
    body = (
      <>
        <p className="sub" style={{ marginBottom: 12 }}>
          {step === 2
            ? 'Start with your faith rhythms. They shape every match.'
            : 'The everyday things that make conversation easy.'}{' '}
          Tap a habit to pick it. Star up to 3 as most important.
        </p>
        <div className="cats">
          {cats.map((c) => (
            <div key={c.key} className={`cat cat-${c.key}`} role="group" aria-label={c.name}>
              <CatHead cat={c} />
              <div className="tchips">
                {taxonomyTags
                  .filter((t) => t.category === c.key)
                  .map((t) => {
                    const on = picked.includes(t.slug);
                    const st = starred.includes(t.slug);
                    return (
                      <span key={t.slug} className={`tchip${on ? ' on' : ''}`}>
                        <button type="button" className="t-main" aria-pressed={on} onClick={() => toggle(t.slug)}>
                          <Icon name={on ? 'check' : 'plus'} />
                          {t.label}
                        </button>
                        {on && (
                          <button
                            type="button"
                            className="t-star"
                            aria-pressed={st}
                            aria-disabled={!st && starFull ? true : undefined}
                            aria-label={st ? `Remove star from ${t.label}` : `Star ${t.label} as most important`}
                            onClick={() => star(t.slug)}
                          >
                            <Icon name="star" className={st ? 'fill' : undefined} />
                          </button>
                        )}
                      </span>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        <p className="counter" role="status" style={{ marginTop: 12 }}>
          {counterText}
        </p>
        {step === 3 && (
          <div className="field" style={{ marginTop: 20 }}>
            <span className="legend" id="mm">
              How Do You Want to Match?
            </span>
            <div className="modes" role="radiogroup" aria-labelledby="mm">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  className="mode"
                  role="radio"
                  aria-checked={fellowshipMode === m.mode}
                  onClick={() => setFellowshipMode(m.mode)}
                >
                  <span className="radio" style={{ marginTop: 2 }} />
                  <span>
                    {m.title}
                    <small>{m.desc}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell
      currentUser={first ? null : currentUser}
      onSwitchedUser={loadInitialState}
    >
      <main className="wrap stack">
        <div className="sec-head">
          <div>
            <h1 className="h1">{first ? 'Set Up Your Profile' : 'Profile Details'}</h1>
            <p className="sub">
              {first
                ? 'Three short steps, then you can start matching.'
                : 'Keep this up to date so your matches stay true to you.'}
            </p>
          </div>
          {!first && (
            <div className="foot-btns">
              <Btn variant="btn-quiet" icon="back" onClick={() => router.replace('/')}>
                Back to Home
              </Btn>
            </div>
          )}
        </div>

        <nav aria-label="Profile steps">
          <ol className="steps">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const done = n < step;
              return (
                <li key={s}>
                  <button
                    type="button"
                    className={`step${done ? ' done' : ''}`}
                    style={{ width: '100%' }}
                    aria-current={n === step ? 'step' : undefined}
                    onClick={() => goStep(n)}
                  >
                    <span className="n">{done ? <Icon name="check" /> : n}</span>
                    <span className="sr">
                      Step {n} of 3{done ? ', done' : ''}:{' '}
                    </span>
                    <span className="lbl trunc">{s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="small" style={{ marginTop: 8, fontWeight: 700, color: 'var(--u-ink)' }}>
            Step {step} of 3: {STEPS[step - 1]}
          </p>
        </nav>

        <div className="prof-grid">
          <section className="card pad" aria-labelledby="st-h">
            <h2 className="h2" id="st-h" ref={headingRef} tabIndex={-1} style={{ marginBottom: 14 }}>
              {STEPS[step - 1]}
            </h2>
            {body}
            {error && (
              <div style={{ marginTop: 16 }}>
                <AlertBox title={error[0]} text={error[1]} action={error[2]} />
              </div>
            )}
            <div className="edit-foot">
              {step > 1 ? (
                <Btn variant="btn-quiet" icon="back" onClick={() => goStep(step - 1)}>
                  Back
                </Btn>
              ) : (
                <span />
              )}
              {step < 3 ? (
                <Btn variant="btn-amber" onClick={() => goStep(step + 1)}>
                  Next: {STEPS[step]}
                </Btn>
              ) : (
                <Btn variant="btn-amber" icon="check" busy={saving} busyLabel="Saving…" onClick={finish}>
                  {finishLabel}
                </Btn>
              )}
            </div>
          </section>

          <aside className="card pad summary" aria-labelledby="sum-h">
            <div className="row">
              {currentUser?.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={currentUser.avatar_url} width={48} height={48} alt="" />
              )}
              <div className="grow">
                <h2 className="h3" id="sum-h">
                  Your Picks
                </h2>
                <p className="small">{counterText}</p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              {CATS.map((c) => {
                const mine = sortHabits(
                  taxonomyTags.filter((t) => t.category === c.key && picked.includes(t.slug)).map((t) => t.slug),
                  tagMap,
                  starredSet
                );
                return (
                  <div key={c.key} className={`s-cat cat-${c.key}`}>
                    <CatHead cat={c} />
                    {mine.length ? (
                      <HabitChips slugs={mine} tagMap={tagMap} starred={starredSet} />
                    ) : (
                      <p className="small">None picked yet.</p>
                    )}
                  </div>
                );
              })}
              <div className="s-cat">
                <p className="small">Matching Mode</p>
                <p className="row" style={{ gap: 8, fontWeight: 700 }}>
                  <Icon name={mode.icon} />
                  {mode.title}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

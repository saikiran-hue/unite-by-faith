'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AlertBox, Btn, CatHead, HabitChips, Icon, sortHabits, type IconName } from '@/components/ubf';
import { CATS } from '@/lib/cats';
import { LifeFitFields } from '@/components/LifeFitFields';
import {
  FIELD_TO_ID,
  LIFE_FIT_ORDER,
  lifeFitBody,
  lifeFitFrom,
  validateLifeFit,
  type LifeFitId,
  type LifeFitValue,
} from '@/lib/life-fit';
import { City, CurrentUser, FellowshipMode, TaxonomyTag, Tradition } from '@/types/database';

const STEPS = ['About You', 'Life fit', 'Faith & Hobbies', 'Tastes, Tech & Skills'];
const LIFE_STEP = 2;
const LIFE_ANCHOR = 'life-fit';
const MODES: { mode: FellowshipMode; title: string; desc: string; icon: IconName }[] = [
  { mode: 'both', title: 'Pods + 1v1 Duos', desc: 'Open to groups and one-to-one friends.', icon: 'users' },
  { mode: 'group_only', title: 'Fellowship Pods Only', desc: 'Small circles of 3 to 4 people.', icon: 'users' },
  { mode: 'duo_only', title: '1v1 Duo Only', desc: 'One friend at a time.', icon: 'user' },
];
const MIN_HABITS = 3;
const MAX_STARRED = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<[string, string, { label: string; onClick: () => void }?] | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [traditions, setTraditions] = useState<Tradition[]>([]);
  const [lifeFit, setLifeFit] = useState<LifeFitValue>(() => lifeFitFrom(null, null));
  const [lfErr, setLfErr] = useState<Partial<Record<LifeFitId, string>>>({});
  const [taxonomyTags, setTaxonomyTags] = useState<TaxonomyTag[]>([]);

  const [step, setStep] = useState(1);

  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [church, setChurch] = useState('');
  const [fellowshipMode, setFellowshipMode] = useState<FellowshipMode>('both');
  const [picked, setPicked] = useState<string[]>([]);
  const [starred, setStarred] = useState<string[]>([]);

  const [fieldErr, setFieldErr] = useState<{ id: 'name' | 'headline'; message: string } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const focusField = useRef<string | null>(null);

  function fillFrom(u: CurrentUser | null, city: City | null) {
    setFullName(u?.full_name ?? '');
    setHeadline(u?.headline ?? '');
    setBio(u?.bio ?? '');
    setChurch(u?.church_or_fellowship ?? '');
    setLifeFit(lifeFitFrom(u, city));
    setLfErr({});
    setFellowshipMode(u?.fellowship_mode || 'both');
    setPicked(u?.tags.map((t) => t.tag_slug) ?? []);
    setStarred(u?.tags.filter((t) => t.is_priority).map((t) => t.tag_slug) ?? []);
  }

  const loadInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (res.ok && data.currentUser) {
        const u: CurrentUser = data.currentUser;
        setCurrentUser(u);
        setTraditions((data.traditions || []) as Tradition[]);
        setTaxonomyTags(
          [...((data.taxonomyTags || []) as TaxonomyTag[])].sort((a, b) => a.sort_order - b.sort_order)
        );
        const toLifeFit = window.location.hash === `#${LIFE_ANCHOR}`;
        if (toLifeFit) focusHeading.current = true;
        setStep(toLifeFit ? LIFE_STEP : 1);
        setError(null);
        fillFrom(u, (data.city as City | null) ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (focusField.current) document.getElementById(`pf-${focusField.current}`)?.focus();
    else if (focusHeading.current) headingRef.current?.focus();
    focusHeading.current = false;
    focusField.current = null;
  }, [step]);

  const tagMap = useMemo(() => new Map(taxonomyTags.map((t) => [t.slug, t])), [taxonomyTags]);

  function goStep(n: number) {
    focusHeading.current = true;
    setStep(n);
    setError(null);
    setFieldErr(null);
    setLfErr({});
  }

  /** Shows errors on the Life fit step and moves focus to the first one. */
  function showLifeFitErrors(errs: Partial<Record<LifeFitId, string>>) {
    const first = LIFE_FIT_ORDER.find((id) => errs[id]);
    setError(null);
    setFieldErr(null);
    setLfErr(errs);
    if (first) focusField.current = first;
    if (step === LIFE_STEP) {
      if (first) document.getElementById(`pf-${first}`)?.focus();
      focusField.current = null;
    } else {
      setStep(LIFE_STEP);
    }
  }

  /** Shows an inline error on a required About You field and moves focus to it. */
  function showFieldError(id: 'name' | 'headline', message: string) {
    focusField.current = id;
    setError(null);
    setFieldErr({ id, message });
    if (step === 1) {
      document.getElementById(`pf-${id}`)?.focus();
      focusField.current = null;
    } else {
      setStep(1);
    }
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
  const savedTags = new Map((currentUser?.tags ?? []).map((t) => [t.tag_slug, t]));
  const tagsChanged =
    picked.length !== savedTags.size ||
    picked.some((slug) => !savedTags.has(slug) || savedTags.get(slug)?.is_priority !== starred.includes(slug));
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
      showFieldError('name', 'Enter your name.');
      return;
    }
    if (!headline.trim()) {
      showFieldError('headline', 'Add a short headline.');
      return;
    }

    const lifeErrs = validateLifeFit(lifeFit);
    if (Object.keys(lifeErrs).length > 0) {
      showLifeFitErrors(lifeErrs);
      return;
    }

    const failed: [string, string] = [
      'We couldn’t save your profile.',
      `Your details are still here. Check your connection and tap ${finishLabel} again.`,
    ];
    setSaving(true);
    setError(null);
    setFieldErr(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          headline,
          bio,
          church,
          ...lifeFitBody(lifeFit),
          // Keep the older text columns in step with the picked city and tradition.
          locationCity: lifeFit.cityName,
          denomination: traditions.find((t) => t.id === lifeFit.traditionId)?.name ?? '',
          fellowshipMode,
          onboardingCompleted: true,
          ...(currentUser?.avatar_url ? { avatarUrl: currentUser.avatar_url } : {}),
          // Returning users: send habits only when changed here, keeping each saved level.
          ...(first || tagsChanged
            ? {
                tags: picked.map((slug) => ({
                  slug,
                  category: tagMap.get(slug)?.category ?? 'faith',
                  level: savedTags.get(slug)?.level ?? 2,
                  isPriority: starred.includes(slug),
                })),
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = res.status < 500 ? await res.json().catch(() => null) : null;
        const fe = data?.error;
        if (fe && typeof fe.field === 'string' && typeof fe.message === 'string') {
          if (fe.field === 'fullName') showFieldError('name', fe.message);
          else if (fe.field === 'headline') showFieldError('headline', fe.message);
          else if (FIELD_TO_ID[fe.field]) showLifeFitErrors({ [FIELD_TO_ID[fe.field]]: fe.message });
          else setError([fe.message, `Check ${fe.field}, then tap ${finishLabel} again.`]);
        } else {
          setError(failed);
        }
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
    const required = id === 'name' || id === 'headline';
    const err = fieldErr?.id === id ? fieldErr.message : null;
    return (
      <div className="field">
        <label htmlFor={`pf-${id}`}>{label}</label>
        {required && <span className="hint">Required</span>}
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
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `pf-${id}-err` : undefined}
            onChange={(e) => {
              set(e.target.value);
              if (err) setFieldErr(null);
            }}
          />
        )}
        {err && (
          <span className="hint" id={`pf-${id}-err`} role="alert" style={{ color: 'var(--u-danger)' }}>
            {err}
          </span>
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
        {field('church', 'Church', church, setChurch, 'Where you worship, if you have one')}
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
  } else if (step === LIFE_STEP) {
    body = (
      <div id={LIFE_ANCHOR}>
        <LifeFitFields
          key={currentUser?.id}
          value={lifeFit}
          onChange={setLifeFit}
          errors={lfErr}
          clearError={(id) => setLfErr((e) => (e[id] ? { ...e, [id]: undefined } : e))}
          traditions={traditions}
          birthDate={currentUser?.private?.birth_date ?? null}
        />
      </div>
    );
  } else {
    const cats = step === 3 ? CATS.slice(0, 2) : CATS.slice(2);
    body = (
      <>
        <p className="sub" style={{ marginBottom: 12 }}>
          {step === 3
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
        {step === STEPS.length && (
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
                ? 'Four short steps, then you can start matching.'
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
                      Step {n} of {STEPS.length}{done ? ', done' : ''}:{' '}
                    </span>
                    <span className="lbl trunc">{s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="small" style={{ marginTop: 8, fontWeight: 700, color: 'var(--u-ink)' }}>
            Step {step} of {STEPS.length}: {STEPS[step - 1]}
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
              {step < STEPS.length ? (
                <div className="foot-btns">
                  {!first && (
                    <Btn variant="btn-outline" icon="check" busy={saving} busyLabel="Saving…" onClick={finish}>
                      {finishLabel}
                    </Btn>
                  )}
                  <Btn variant="btn-amber" onClick={() => goStep(step + 1)}>
                    Next: {STEPS[step]}
                  </Btn>
                </div>
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

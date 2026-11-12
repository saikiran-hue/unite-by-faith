'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AlertBox, Btn, CatHead, HabitChips, Icon, Note, Select, sortHabits, type IconName } from '@/components/ubf';
import { CATS, type Cat } from '@/lib/cats';
import { MATCH_SPLIT } from '@/lib/matching/pillar-weights';
import { LifeFitFields } from '@/components/LifeFitFields';
import { shouldSendOwn, type OwnHabit } from '@/components/OwnHabits';
import { HabitPicker, MAX_STARRED } from '@/components/HabitPicker';
import {
  FIELD_TO_ID,
  LIFE_FIT_ORDER,
  lifeFitBody,
  lifeFitFrom,
  validateLifeFit,
  type LifeFitId,
  type LifeFitValue,
} from '@/lib/life-fit';
import { City, CurrentUser, FellowshipMode, PillarCategory, TaxonomyTag, Tradition } from '@/types/database';

const STEPS = ['About You', 'Life Fit', 'Faith & Hobbies', 'Tastes, Tech & Skills'];
const LIFE_STEP = 2;
const LIFE_ANCHOR = 'life-fit';
const MODES: { mode: FellowshipMode; title: string; desc: string; icon: IconName }[] = [
  { mode: 'both', title: 'Pods + 1v1 Duos', desc: 'Open to groups and one-to-one friends.', icon: 'users' },
  { mode: 'group_only', title: 'Fellowship Pods Only', desc: 'Small circles of 3 to 4 people.', icon: 'users' },
  { mode: 'duo_only', title: '1v1 Duo Only', desc: 'One friend at a time.', icon: 'user' },
];
const MIN_HABITS = 3;

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
  const [retiredDropped, setRetiredDropped] = useState(false);
  const [own, setOwn] = useState<OwnHabit[]>([]);
  // The habit steps show one category at a time; each step falls back to its first category.
  const [tab, setTab] = useState<PillarCategory>('faith');
  const [expanded, setExpanded] = useState<Partial<Record<PillarCategory, boolean>>>({});
  const [reviewOpen, setReviewOpen] = useState(false);

  const [fieldErr, setFieldErr] = useState<{ id: 'name' | 'headline'; message: string } | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const focusField = useRef<string | null>(null);

  function fillFrom(u: CurrentUser | null, city: City | null, retiredSlugs: Set<string> = new Set()) {
    setFullName(u?.full_name ?? '');
    setHeadline(u?.headline ?? '');
    setBio(u?.bio ?? '');
    setChurch(u?.church_or_fellowship ?? '');
    setLifeFit(lifeFitFrom(u, city));
    setLfErr({});
    setFellowshipMode(u?.fellowship_mode || 'both');
    const kept = (u?.tags ?? []).filter((t) => !retiredSlugs.has(t.tag_slug));
    setRetiredDropped(kept.length !== (u?.tags.length ?? 0));
    setPicked(kept.map((t) => t.tag_slug));
    setStarred(kept.filter((t) => t.is_priority).map((t) => t.tag_slug));
    setOwn((u?.customTags ?? []).map((c) => ({ category: c.category, label: c.label })));
  }

  const loadInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (res.ok && data.currentUser) {
        const u: CurrentUser = data.currentUser;
        setCurrentUser(u);
        setTraditions((data.traditions || []) as Tradition[]);
        const tags = [...((data.taxonomyTags || []) as TaxonomyTag[])].sort((a, b) => a.sort_order - b.sort_order);
        setTaxonomyTags(tags);
        // Retired habits are no longer offered, so drop them from the picks (saving removes them).
        const retiredSlugs = new Set(tags.filter((t) => t.is_active === false).map((t) => t.slug));
        // #life-fit opens the step; #life-fit-<field> (e.g. #life-fit-distance) also focuses that field.
        const hash = window.location.hash.slice(1);
        const toLifeFit = hash === LIFE_ANCHOR || hash.startsWith(`${LIFE_ANCHOR}-`);
        if (toLifeFit) {
          const field = hash.slice(LIFE_ANCHOR.length + 1);
          if (field) focusField.current = field;
          else focusHeading.current = true;
        }
        setStep(toLifeFit ? LIFE_STEP : 1);
        setError(null);
        fillFrom(u, (data.city as City | null) ?? null, retiredSlugs);
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
    if (n === step) return;
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
  const savedOwn = currentUser?.customTags ?? [];
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
          // Own habits only when changed or unmapped, and never if they failed to load (see shouldSendOwn).
          ...(shouldSendOwn(own, savedOwn, currentUser?.customTagsLoaded !== false) ? { customTags: own } : {}),
        }),
      });
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
      if (!res.ok) {
        const data = res.status < 500 ? await res.json().catch(() => null) : null;
        const fe = data?.error;
        if (fe && typeof fe.field === 'string' && typeof fe.message === 'string') {
          if (fe.field === 'fullName') showFieldError('name', fe.message);
          else if (fe.field === 'headline') showFieldError('headline', fe.message);
          else if (FIELD_TO_ID[fe.field]) showLifeFitErrors({ [FIELD_TO_ID[fe.field]]: fe.message });
          else if (fe.field === 'customTags') setError([fe.message, `Change your own habits, then tap ${finishLabel} again.`]);
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
      <AppShell currentUser={null} width={1280}>
        <main className="wrap w-1280 stack">
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
  const mode = MODES.find((m) => m.mode === fellowshipMode) ?? MODES[0];
  const catCount = (key: PillarCategory) => picked.filter((slug) => tagMap.get(slug)?.category === key).length;

  function field(id: string, label: string, value: string, set: (v: string) => void, ph?: string, opts?: string[]) {
    const required = id === 'name' || id === 'headline';
    const err = fieldErr?.id === id ? fieldErr.message : null;
    return (
      <div className="field">
        <label htmlFor={`pf-${id}`}>{label}</label>
        {required && <span className="hint">Required</span>}
        {opts ? (
          <Select
            id={`pf-${id}`}
            value={value}
            onChange={set}
            options={opts.map((o) => ({ value: o, label: o }))}
          />
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
      <div className="form ob-grid">
        {field('name', 'Name', fullName, setFullName)}
        {field('headline', 'Headline', headline, setHeadline, 'e.g. Teacher who loves long runs')}
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
      <div id={LIFE_ANCHOR} className="ob-life">
        <p className="sub" style={{ marginBottom: 12 }}>
          Life Fit is {MATCH_SPLIT.lifeFit}% of your match. Faith is {MATCH_SPLIT.faith}% and your interests{' '}
          {MATCH_SPLIT.interests}%.
        </p>
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
    const c = cats.find((x) => x.key === tab) ?? cats[0];
    body = (
      <>
        <p className="sub" style={{ marginBottom: 12 }}>
          {step === 3
            ? 'Start with your faith rhythms. They shape every match.'
            : 'The everyday things that make conversation easy.'}{' '}
          Tap a habit to pick it. Star up to 3 as most important.
        </p>
        <CatTabs cats={cats} active={c.key} count={catCount} onPick={setTab} />
        <div className={`cat cat-${c.key} ob-panel`} role="tabpanel" id="ob-panel" aria-labelledby={`ob-tab-${c.key}`}>
          <HabitPicker
            cat={c}
            taxonomyTags={taxonomyTags}
            picked={picked}
            starred={starred}
            onToggle={toggle}
            onStar={star}
            own={own}
            setOwn={(next) => {
              setOwn(next);
              setError(null);
            }}
            savedOwn={savedOwn}
            allowOwn={currentUser?.customTagsLoaded !== false}
            expanded={!!expanded[c.key]}
            onExpand={(open) => setExpanded({ ...expanded, [c.key]: open })}
            headExtra={<span className="counter ob-picked">{catCount(c.key)} picked</span>}
          />
        </div>
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
    <AppShell currentUser={first ? null : currentUser} onSwitchedUser={loadInitialState} width={1280}>
      <main className="wrap w-1280 stack ob">
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
                      Step {n} of {STEPS.length}{done ? ', done' : ''}: {s}
                    </span>
                    <span className="lbl trunc" aria-hidden="true">
                      {s}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="card pad ob-step" aria-labelledby="st-h">
          <p className="small ob-of">
            Step {step} of {STEPS.length}
          </p>
          <h2 className="h2" id="st-h" ref={headingRef} tabIndex={-1} style={{ marginBottom: 14 }}>
            {STEPS[step - 1]}
          </h2>
          {body}
          {retiredDropped && (
            <Note style={{ marginTop: 16 }}>A habit you picked is no longer offered and was removed.</Note>
          )}
          {error && (
            <div style={{ marginTop: 16 }}>
              <AlertBox title={error[0]} text={error[1]} action={error[2]} />
            </div>
          )}
        </section>

        <div className="card ob-bar">
          <div className="ob-info">
            <p className="counter" role="status">
              {counterText}
            </p>
            <Btn variant="btn-text" aria-haspopup="dialog" onClick={() => setReviewOpen(true)}>
              Review Picks
            </Btn>
          </div>
          {step > 1 && (
            <Btn variant="btn-quiet" icon="back" onClick={() => goStep(step - 1)}>
              Back
            </Btn>
          )}
          {step < STEPS.length ? (
            <div className="foot-btns">
              {!first && (
                <Btn variant="btn-outline" icon="check" busy={saving} busyLabel="Saving…" onClick={finish}>
                  {finishLabel}
                </Btn>
              )}
              <Btn variant="btn-amber" onClick={() => goStep(step + 1)}>
                Next<span className="ob-next-to">: {STEPS[step]}</span>
                <Icon name="arrow" />
              </Btn>
            </div>
          ) : (
            <div className="foot-btns">
              <Btn variant="btn-amber" icon="check" busy={saving} busyLabel="Saving…" onClick={finish}>
                {finishLabel}
              </Btn>
            </div>
          )}
        </div>

        <ReviewPicks open={reviewOpen} onClose={() => setReviewOpen(false)} summary={counterText}>
          {CATS.map((c) => {
            const mine = sortHabits(
              taxonomyTags.filter((t) => t.category === c.key && picked.includes(t.slug)).map((t) => t.slug),
              tagMap,
              starredSet
            );
            const mineOwn = own.filter((o) => o.category === c.key);
            return (
              <div key={c.key} className={`s-cat cat-${c.key}`}>
                <CatHead cat={c} />
                {mine.length || mineOwn.length ? (
                  <HabitChips slugs={mine} tagMap={tagMap} starred={starredSet} own={mineOwn} />
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
        </ReviewPicks>
      </main>
    </AppShell>
  );
}

/** Category tabs inside a habit step; arrow keys, Home and End move between them (roving tabindex). */
function CatTabs({
  cats,
  active,
  count,
  onPick,
}: {
  cats: Cat[];
  active: PillarCategory;
  count: (key: PillarCategory) => number;
  onPick: (key: PillarCategory) => void;
}) {
  function onKey(e: React.KeyboardEvent, i: number) {
    const n = cats.length;
    const next =
      e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onPick(cats[next].key);
    document.getElementById(`ob-tab-${cats[next].key}`)?.focus();
  }
  return (
    <div className="ob-tabs" role="tablist" aria-label="Habit categories">
      {cats.map((c, i) => {
        const on = c.key === active;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            id={`ob-tab-${c.key}`}
            aria-selected={on}
            aria-controls="ob-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(c.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <Icon name={c.icon} />
            <span className="trunc">{c.short}</span>{' '}
            <span className="ob-count">
              {count(c.key)}
              <span className="sr"> picked</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Review Picks": every pick by category and the matching mode, in a modal dialog. */
function ReviewPicks({
  open,
  onClose,
  summary,
  children,
}: {
  open: boolean;
  onClose: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="scrim"
      aria-labelledby="rv-h"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal summary">
        <div className="modal-head">
          <div>
            <h2 className="h2" id="rv-h">
              Your Picks
            </h2>
            <p className="sub">{summary}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

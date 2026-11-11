'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Level, TaxonomyTag, UserProfile } from '@/types/database';
import { CATS } from '@/lib/cats';
import { AlertBox, Btn, CatHead, Empty, HabitChips, Icon, Note, sortHabits } from '@/components/ubf';
import { TagSearch } from '@/components/TagSearch';

const MIN_HABITS = 3;
const MAX_STARRED = 3;
const TOP_N = 12;
const DEFAULT_LEVEL: Level = 2;
const LEVELS: { value: Level; label: string }[] = [
  { value: 1, label: 'Casual' },
  { value: 2, label: 'Regular' },
  { value: 3, label: 'Passionate' },
];

/** Three-step radiogroup; arrow keys move the choice (roving tabindex). */
function LevelControl({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  function onKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (((value - 1 + dir + 3) % 3) + 1) as Level;
    onChange(next);
    const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
    buttons?.[next - 1]?.focus();
  }
  return (
    <div className="lvl" role="radiogroup" aria-label={`How much: Casual / Regular / Passionate, ${label}`}>
      {LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          tabIndex={value === l.value ? 0 : -1}
          onClick={() => onChange(l.value)}
          onKeyDown={onKey}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

interface HabitsPanelProps {
  user: UserProfile;
  taxonomyTags: TaxonomyTag[];
  tagMap: Map<string, TaxonomyTag>;
  /** Shows "Habits saved" until the next search. */
  saved: boolean;
  /** Increment to open the editor from elsewhere (e.g. an empty search result). */
  editSignal?: number;
  /** Called after a successful save so matches can be re-scored. */
  onSaved: () => Promise<unknown> | void;
}

export function HabitsPanel({ user, taxonomyTags, tagMap, saved, editSignal = 0, onSaved }: HabitsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [starred, setStarred] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [retired, setRetired] = useState(false);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [starHint, setStarHint] = useState(false);
  const [error, setError] = useState<[string, string] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Focus the editor heading on open, and return focus to Edit Habits on close.
  useEffect(() => {
    if (editing) headingRef.current?.focus();
    else if (wasEditing.current) editBtnRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const savedPicked = user.tags.map((t) => t.tag_slug);
  const savedStarred = new Set(user.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));
  const savedLevels = new Map(user.tags.map((t) => [t.tag_slug, (t.level ?? DEFAULT_LEVEL) as Level]));

  function openEditor() {
    const keep = (s: string) => tagMap.get(s)?.is_active !== false;
    setPicked(savedPicked.filter(keep));
    setStarred([...savedStarred].filter(keep));
    setLevels(Object.fromEntries([...savedLevels].filter(([s]) => keep(s))));
    setRetired(savedPicked.some((s) => !keep(s)));
    setExpanded({});
    setError(null);
    setStarHint(false);
    setEditing(true);
  }

  // Open the editor when the parent asks (adjusting state during render, per React docs).
  const [seenSignal, setSeenSignal] = useState(editSignal);
  if (editSignal !== seenSignal) {
    setSeenSignal(editSignal);
    openEditor();
  }

  function cancel() {
    setError(null);
    setEditing(false);
  }

  function toggle(slug: string) {
    if (picked.includes(slug)) {
      setPicked(picked.filter((s) => s !== slug));
      setStarred(starred.filter((s) => s !== slug));
    } else {
      setPicked([...picked, slug]);
      setLevels((l) => ({ ...l, [slug]: l[slug] ?? DEFAULT_LEVEL }));
    }
    setError(null);
    setStarHint(false);
  }

  function star(slug: string) {
    if (starred.includes(slug)) {
      setStarred(starred.filter((s) => s !== slug));
      setStarHint(false);
    } else if (starred.length < MAX_STARRED) {
      setStarred([...starred, slug]);
    } else {
      setStarHint(true);
    }
  }

  async function save() {
    const n = picked.length;
    if (n < MIN_HABITS) {
      setError([
        'Pick at least 3 habits.',
        `You have ${n}. Add ${MIN_HABITS - n} more so we can find good matches, then tap Save Habits.`,
      ]);
      return;
    }
    setSaving(true);
    setError(null);
    const failed: [string, string] = [
      'We couldn’t save your habits.',
      'Your picks are still here. Check your connection and tap Save Habits again.',
    ];
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: picked.map((slug) => ({
            slug,
            category: tagMap.get(slug)?.category ?? 'faith',
            level: levels[slug] ?? DEFAULT_LEVEL,
            isPriority: starred.includes(slug),
          })),
        }),
      });
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        const message = res.status < 500 ? body?.error?.message : undefined;
        setError(message ? ['We couldn’t save your habits.', message] : failed);
        return;
      }
      await onSaved();
      setEditing(false);
    } catch {
      setError(failed);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Edit ---------------- */
  if (editing) {
    const starFull = starred.length >= MAX_STARRED;
    const renderTag = (t: TaxonomyTag) => {
      const on = picked.includes(t.slug);
      const st = starred.includes(t.slug);
      return (
        <span key={t.slug} className="tpick">
          <span className={`tchip${on ? ' on' : ''}`}>
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
          {on && (
            <LevelControl
              label={t.label}
              value={levels[t.slug] ?? DEFAULT_LEVEL}
              onChange={(v) => setLevels({ ...levels, [t.slug]: v })}
            />
          )}
        </span>
      );
    };
    return (
      <section className="card pad" aria-labelledby="hab-h">
        <h2 className="h2" id="hab-h" ref={headingRef} tabIndex={-1}>
          Edit Habits
        </h2>
        <p className="sub">
          Tap a habit to pick it. Tap its star to mark up to 3 as most important. Starred habits count double.
        </p>
        <TagSearch picked={picked} onPick={toggle} />
        <div className="cats" style={{ marginTop: 16 }}>
          {CATS.map((c) => {
            const inCat = taxonomyTags.filter((t) => t.category === c.key);
            const active = inCat.filter((t) => t.is_active !== false);
            const open = expanded[c.key];
            const top = [...active]
              .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.sort_order - b.sort_order)
              .slice(0, TOP_N);
            const shown = new Set(top.map((t) => t.slug));
            // Picks outside the top list (searched, or since retired) stay visible so they can be changed.
            const extra = inCat.filter((t) => picked.includes(t.slug) && !shown.has(t.slug));
            const groups = new Map<string, TaxonomyTag[]>();
            if (open) {
              for (const t of [...active, ...extra.filter((t) => t.is_active === false)].sort(
                (a, b) => a.sort_order - b.sort_order
              )) {
                const g = t.subgroup ?? '';
                groups.set(g, [...(groups.get(g) ?? []), t]);
              }
            }
            return (
              <div key={c.key} className={`cat cat-${c.key}`} role="group" aria-label={c.name}>
                <CatHead cat={c} />
                {open ? (
                  [...groups].map(([name, tags]) => (
                    <div key={name}>
                      {name && <h4 className="subgroup">{name}</h4>}
                      <div className="tchips">{tags.map(renderTag)}</div>
                    </div>
                  ))
                ) : (
                  <div className="tchips">{[...top, ...extra].map(renderTag)}</div>
                )}
                {active.length > TOP_N && (
                  <Btn
                    variant="btn-quiet"
                    className="more-btn"
                    aria-expanded={!!open}
                    onClick={() => setExpanded({ ...expanded, [c.key]: !open })}
                  >
                    {open ? 'Show fewer' : `Show all ${active.length}`}
                  </Btn>
                )}
              </div>
            );
          })}
        </div>
        {retired && <Note style={{ marginTop: 16 }}>A habit you picked is no longer offered and was removed.</Note>}
        {error && (
          <div style={{ marginTop: 16 }}>
            <AlertBox title={error[0]} text={error[1]} />
          </div>
        )}
        <div className="edit-foot">
          <p className="counter" role="status">
            {picked.length} picked, {starred.length} of 3 starred
            {starHint && (
              <span className="small" style={{ display: 'block', fontWeight: 500 }}>
                You can star up to 3. Remove a star to add another.
              </span>
            )}
          </p>
          <div className="foot-btns">
            <Btn variant="btn-quiet" onClick={cancel} disabled={saving}>
              Cancel
            </Btn>
            <Btn variant="btn-amber" icon="check" busy={saving} busyLabel="Saving…" onClick={save}>
              Save Habits
            </Btn>
          </div>
        </div>
      </section>
    );
  }

  /* ---------------- Empty ---------------- */
  if (!savedPicked.length) {
    return (
      <section className="card pad" aria-labelledby="hab-h">
        <h2 className="h2" id="hab-h">
          My Habits
        </h2>
        <Empty
          icon="star"
          title="Pick Your First Habits"
          text="Habits are the things you do and love. Pick at least 3 and we will match you with people who share them, faith first."
        >
          <Btn variant="btn-amber" icon="plus" onClick={openEditor} ref={editBtnRef}>
            Choose Habits
          </Btn>
        </Empty>
      </section>
    );
  }

  /* ---------------- View ---------------- */
  return (
    <section className="card pad" aria-labelledby="hab-h">
      <div className="sec-head">
        <div>
          <h2 className="h2" id="hab-h">
            My Habits
          </h2>
          <p className="sub">
            {savedPicked.length} habits, {savedStarred.size} starred. Starred habits count double.
          </p>
        </div>
        <Btn variant="btn-outline" icon="pencil" onClick={openEditor} ref={editBtnRef}>
          Edit Habits
        </Btn>
      </div>
      {saved && (
        <Note style={{ marginTop: 12 }}>Habits saved. Tap Search to see new matches.</Note>
      )}
      <div className="cats four" style={{ marginTop: 16 }}>
        {CATS.map((c) => {
          const mine = sortHabits(
            savedPicked.filter((s) => tagMap.get(s)?.category === c.key),
            tagMap,
            savedStarred
          );
          return (
            <div key={c.key} className={`cat spot cat-${c.key}`}>
              <CatHead cat={c} />
              {mine.length ? (
                <HabitChips slugs={mine} tagMap={tagMap} starred={savedStarred} levels={savedLevels} />
              ) : (
                <p className="small">None picked yet.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

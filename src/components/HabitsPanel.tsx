'use client';

import { useEffect, useRef, useState } from 'react';
import { TaxonomyTag, UserProfile } from '@/types/database';
import { CATS } from '@/lib/cats';
import { AlertBox, Btn, CatHead, Empty, HabitChips, Icon, Note, sortHabits } from '@/components/ubf';

const MIN_HABITS = 3;
const MAX_STARRED = 3;

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

  // Open the editor when the parent asks (adjusting state during render, per React docs).
  const [seenSignal, setSeenSignal] = useState(editSignal);
  if (editSignal !== seenSignal) {
    setSeenSignal(editSignal);
    setPicked(user.tags.map((t) => t.tag_slug));
    setStarred(user.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));
    setError(null);
    setStarHint(false);
    setEditing(true);
  }

  const savedPicked = user.tags.map((t) => t.tag_slug);
  const savedStarred = new Set(user.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));

  function startEditing() {
    setPicked(savedPicked);
    setStarred([...savedStarred]);
    setError(null);
    setStarHint(false);
    setEditing(true);
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
      // The profile endpoint replaces every field it is sent, so send the
      // current profile unchanged alongside the new habits.
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: user.full_name,
          headline: user.headline,
          bio: user.bio,
          denomination: user.denomination_or_tradition,
          church: user.church_or_fellowship,
          locationCity: user.location_city,
          yearsInFaith: user.years_in_faith,
          fellowshipMode: user.fellowship_mode,
          avatarUrl: user.avatar_url,
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
    return (
      <section className="card pad" aria-labelledby="hab-h">
        <h2 className="h2" id="hab-h" ref={headingRef} tabIndex={-1}>
          Edit Habits
        </h2>
        <p className="sub">
          Tap a habit to pick it. Tap its star to mark up to 3 as most important. Starred habits count double.
        </p>
        <div className="cats" style={{ marginTop: 16 }}>
          {CATS.map((c) => (
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
          <Btn variant="btn-amber" icon="plus" onClick={startEditing} ref={editBtnRef}>
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
        <Btn variant="btn-outline" icon="pencil" onClick={startEditing} ref={editBtnRef}>
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
                <HabitChips slugs={mine} tagMap={tagMap} starred={savedStarred} />
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

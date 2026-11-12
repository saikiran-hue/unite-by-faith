'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurrentUser, Level, TaxonomyTag } from '@/types/database';
import { AlertBox, Btn, Icon, Note } from '@/components/ubf';
import { shouldSendOwn } from '@/components/OwnHabits';
import { DEFAULT_LEVEL, HabitPicker, MAX_STARRED } from '@/components/HabitPicker';
import { EDIT_STEPS, isDirty, stepForError, type HabitDraft } from '@/lib/edit-habits';

const MIN_HABITS = 3;

interface EditHabitsModalProps {
  user: CurrentUser;
  taxonomyTags: TaxonomyTag[];
  tagMap: Map<string, TaxonomyTag>;
  /** The step (0-based) to open at. */
  initialStep?: number;
  /** Called after a successful save, before the modal closes. */
  onSaved: () => Promise<unknown> | void;
  /** Called once the dialog has closed. The parent unmounts it; each open mounts a fresh one. */
  onClose: () => void;
}

/** Edit Habits: one category per step in a modal dialog. Reads the saved habits on mount. */
export function EditHabitsModal({ user, taxonomyTags, tagMap, initialStep = 0, onSaved, onClose }: EditHabitsModalProps) {
  const router = useRouter();
  const steps = EDIT_STEPS;
  const savedOwn = user.customTags ?? [];
  const allowOwn = user.customTagsLoaded !== false;

  // Snapshot at open, without retired habits (saving removes them).
  const [start] = useState<HabitDraft & { retired: boolean }>(() => {
    const keep = (s: string) => tagMap.get(s)?.is_active !== false;
    const slugs = user.tags.map((t) => t.tag_slug);
    return {
      picked: slugs.filter(keep),
      starred: user.tags.filter((t) => t.is_priority && keep(t.tag_slug)).map((t) => t.tag_slug),
      levels: Object.fromEntries(
        user.tags.filter((t) => keep(t.tag_slug)).map((t) => [t.tag_slug, (t.level ?? DEFAULT_LEVEL) as Level])
      ),
      own: savedOwn.map((c) => ({ category: c.category, label: c.label })),
      retired: slugs.some((s) => !keep(s)),
    };
  });
  const [picked, setPicked] = useState(start.picked);
  const [starred, setStarred] = useState(start.starred);
  const [levels, setLevels] = useState(start.levels);
  const [own, setOwn] = useState(start.own);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [starHint, setStarHint] = useState(false);
  const [error, setError] = useState<[string, string] | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLParagraphElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const stepMoved = useRef(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    stepRef.current?.focus();
  }, []);

  // After a step change: back to the top of the body, focus on the step line.
  useEffect(() => {
    if (!stepMoved.current) return;
    stepMoved.current = false;
    bodyRef.current?.scrollTo({ top: 0 });
    stepRef.current?.focus();
  }, [step]);

  // The confirm takes focus; Keep Editing hands it back to Close once the header is no longer inert.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) closeRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const dirty = isDirty({ picked, starred, levels, own }, start);

  function moveTo(i: number) {
    if (i === step) return;
    stepMoved.current = true;
    setStep(i);
  }

  function goStep(i: number) {
    moveTo(i);
    setError(null);
    setStarHint(false);
  }

  function close() {
    dialogRef.current?.close();
  }

  function requestClose() {
    if (saving) return;
    if (confirming) keepEditing();
    else if (dirty) setConfirming(true);
    else close();
  }

  function keepEditing() {
    setConfirming(false);
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

  /** Shows a save problem on the step that owns it. */
  function showError(problem: string, e: [string, string]) {
    moveTo(
      stepForError(problem, {
        steps,
        current: step,
        picked,
        categoryOf: (s) => tagMap.get(s)?.category,
        own,
        savedOwn,
      })
    );
    setError(e);
  }

  async function save() {
    const n = picked.length;
    if (n < MIN_HABITS) {
      showError('min', [
        'Pick at least 3 habits.',
        `You have ${n}. Add ${MIN_HABITS - n} more so we can find good matches, then tap Save Habits on the last step.`,
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
          // Own habits only when changed or unmapped, and never if they failed to load (see shouldSendOwn).
          ...(shouldSendOwn(own, savedOwn, allowOwn) ? { customTags: own } : {}),
        }),
      });
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { field?: string; message?: string } } | null;
        const message = res.status < 500 ? body?.error?.message : undefined;
        if (message) showError(body?.error?.field ?? '', ['We couldn’t save your habits.', message]);
        else setError(failed);
        return;
      }
      await onSaved();
      close();
    } catch {
      setError(failed);
    } finally {
      setSaving(false);
    }
  }

  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <dialog
      ref={dialogRef}
      className="scrim hm-scrim"
      aria-modal="true"
      aria-labelledby="hm-h"
      aria-describedby="hm-of"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.key === 'Tab') {
          // Keep Tab inside the dialog: wrap from the last control to the first and back.
          const all = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter(
            (el) => el.tabIndex >= 0 && !el.closest('[inert]') && !(el as HTMLButtonElement).disabled && el.offsetParent !== null
          );
          const edge = e.shiftKey ? all[0] : all[all.length - 1];
          if (document.activeElement === edge) {
            e.preventDefault();
            (e.shiftKey ? all[all.length - 1] : all[0])?.focus();
          }
          return;
        }
        // Handle Escape here: Chrome only lets a page cancel the dialog's own Escape once.
        if (e.key !== 'Escape') return;
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="hm">
        <div className="hm-head" inert={confirming}>
          <div className="hm-top">
            <h2 className="h2" id="hm-h">
              Edit Habits
            </h2>
            <div className="hm-dots" role="group" aria-label="Steps">
              {steps.map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  className={`hm-dot${i < step ? ' done' : ''}`}
                  aria-label={`Step ${i + 1} of ${steps.length}: ${x.name}`}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => goStep(i)}
                >
                  <i />
                </button>
              ))}
            </div>
            <button ref={closeRef} type="button" className="icon-btn" aria-label="Close" onClick={requestClose}>
              <Icon name="x" />
            </button>
          </div>
          <p className="small hm-of" id="hm-of" ref={stepRef} tabIndex={-1}>
            Step {step + 1} of {steps.length}: {s.name}
          </p>
        </div>

        <div className="hm-body" ref={bodyRef} inert={confirming}>
          <p className="sub" style={{ marginBottom: 12 }}>
            Tap a habit to pick it. Tap its star to mark up to 3 as most important. Starred habits count double.
          </p>
          <div className={`hm-panel cat-${s.cat.key}`}>
            <HabitPicker
              key={s.id}
              cat={s.cat}
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
              allowOwn={allowOwn}
              expanded={!!expanded[s.id]}
              onExpand={(open) => setExpanded({ ...expanded, [s.id]: open })}
              levels={{ value: levels, onChange: (slug, v) => setLevels({ ...levels, [slug]: v }) }}
            />
          </div>
          {start.retired && (
            <Note style={{ marginTop: 16 }}>A habit you picked is no longer offered and was removed.</Note>
          )}
          {error && (
            <div style={{ marginTop: 16 }}>
              <AlertBox title={error[0]} text={error[1]} />
            </div>
          )}
        </div>

        {confirming ? (
          <div className="hm-foot hm-confirm" role="group" aria-labelledby="hm-cf-h" aria-describedby="hm-cf-t">
            <div className="hm-count">
              <p className="counter" id="hm-cf-h" role="alert">
                Discard Changes?
              </p>
              <p className="small" id="hm-cf-t">
                The changes you made here will not be saved.
              </p>
            </div>
            <div className="foot-btns">
              <Btn variant="btn-quiet" ref={keepRef} onClick={keepEditing}>
                Keep Editing
              </Btn>
              <Btn variant="btn-amber" onClick={close}>
                Discard
              </Btn>
            </div>
          </div>
        ) : (
          <div className="hm-foot">
            <p className="counter hm-count" role="status">
              {picked.length} picked, {starred.length} of 3 starred
              {starHint && (
                <span className="small" style={{ display: 'block', fontWeight: 500 }}>
                  You can star up to 3. Remove a star to add another.
                </span>
              )}
            </p>
            {step > 0 && (
              <Btn variant="btn-quiet" icon="back" onClick={() => goStep(step - 1)} disabled={saving}>
                Back
              </Btn>
            )}
            {last ? (
              <Btn variant="btn-amber" icon="check" busy={saving} busyLabel="Saving…" onClick={save} className="hm-next">
                Save Habits
              </Btn>
            ) : (
              <Btn variant="btn-amber" onClick={() => goStep(step + 1)} className="hm-next">
                Next
                <Icon name="arrow" />
              </Btn>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

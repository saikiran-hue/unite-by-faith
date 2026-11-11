'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TaxonomyTag } from '@/types/database';
import { CAT_BY_KEY, CATS } from '@/lib/cats';
import { AlertBox, Btn, Icon, sortHabits } from '@/components/ubf';

interface CreatePodDialogProps {
  open: boolean;
  onClose: () => void;
  tagMap: Map<string, TaxonomyTag>;
  /** The user's habits and stars. Read on mount; the parent remounts the dialog per open. */
  habits: string[];
  starred: Set<string>;
}

type Errors = { name?: string; desc?: string; when?: string; habits?: string };

export function CreatePodDialog({ open, onClose, tagMap, habits, starred }: CreatePodDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const whenRef = useRef<HTMLInputElement>(null);

  // Starred first, then faith first.
  const mine = sortHabits(habits, tagMap, starred);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [when, setWhen] = useState('');
  const [size, setSize] = useState<3 | 4>(4);
  const [picked, setPicked] = useState<string[]>(() => mine.slice(0, 5));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      nameRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  function toggle(slug: string) {
    if (picked.includes(slug)) {
      setPicked(picked.filter((s) => s !== slug));
      setErrors({ ...errors, habits: undefined });
    } else if (picked.length < 5) {
      setPicked([...picked, slug]);
      setErrors({ ...errors, habits: undefined });
    } else {
      setErrors({ ...errors, habits: 'A group can have up to 5 habits. Remove one to add another.' });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = 'Give your group a name.';
    if (!desc.trim()) next.desc = 'Say what you’ll do together, e.g. read a psalm and pray for the week.';
    if (!when.trim()) next.when = 'Tell people when you meet, e.g. Saturdays 9:00 AM IST.';
    if (!picked.length) next.habits = 'Pick at least 1 habit so the right people find you.';
    setErrors(next);
    setFailed(false);
    if (next.name) return nameRef.current?.focus();
    if (next.desc) return descRef.current?.focus();
    if (next.when) return whenRef.current?.focus();
    if (next.habits) return;

    setBusy(true);
    try {
      const res = await fetch('/api/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: name.trim(),
          description: desc.trim(),
          meetingCadence: when.trim(),
          maxMembers: size,
          anchorTags: picked,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFailed(true);
        return;
      }
      onClose();
      router.push(`/rooms/${data.chat_room_id}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function field(
    id: 'name' | 'desc' | 'when',
    label: string,
    placeholder: string,
    value: string,
    set: (v: string) => void,
    opts: { hint?: string; area?: boolean } = {}
  ) {
    const err = errors[id];
    const describedBy = [opts.hint ? `cg-${id}-h` : '', err ? `cg-${id}-e` : ''].filter(Boolean).join(' ') || undefined;
    const common = {
      className: 'input',
      id: `cg-${id}`,
      placeholder,
      value,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': describedBy,
    } as const;
    return (
      <div className="field">
        <label htmlFor={`cg-${id}`}>{label}</label>
        {opts.hint && (
          <span className="hint" id={`cg-${id}-h`}>
            {opts.hint}
          </span>
        )}
        {opts.area ? (
          <textarea {...common} ref={descRef} onChange={(e) => set(e.target.value)} />
        ) : (
          <input {...common} ref={id === 'name' ? nameRef : whenRef} onChange={(e) => set(e.target.value)} />
        )}
        {err && (
          <span className="err" id={`cg-${id}-e`}>
            <Icon name="alert" />
            {err}
          </span>
        )}
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="scrim"
      aria-labelledby="cg-h"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2 className="h2" id="cg-h">
              Create Group
            </h2>
            <p className="sub">Start a pod of 3 or 4 people who share your habits.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <form className="form" onSubmit={submit} noValidate>
          {failed && (
            <AlertBox
              title="We couldn’t create your group."
              text="Nothing was lost. Check your connection and tap Create Group again."
            />
          )}
          {field('name', 'Group Name', 'e.g. Saturday Psalms & Coffee', name, setName)}
          {field('desc', 'What You’ll Do Together', 'e.g. Read a psalm, share a coffee, pray for the week.', desc, setDesc, {
            area: true,
          })}
          {field('when', 'When You Meet', 'e.g. Saturdays 9:00 AM IST', when, setWhen, {
            hint: 'Add the day, time and time zone.',
          })}
          <div className="field">
            <span className="legend" id="cg-size">
              Group Size
            </span>
            <div className="seg" role="radiogroup" aria-labelledby="cg-size">
              {([3, 4] as const).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={size === n} onClick={() => setSize(n)}>
                  <span className="radio" />
                  {n} People
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="legend" id="cg-hab">
              Group Habits
            </span>
            <span className="hint">Pre-filled from your habits, starred first. Pick up to 5.</span>
            <div className="tchips" role="group" aria-labelledby="cg-hab">
              {mine.map((slug) => {
                const on = picked.includes(slug);
                const cat = CAT_BY_KEY[tagMap.get(slug)?.category ?? 'faith'] ?? CATS[0];
                return (
                  <span key={slug} className={`tchip cat-${cat.key}${on ? ' on' : ''}`}>
                    <button
                      type="button"
                      className="t-main"
                      style={{ paddingRight: 14 }}
                      aria-pressed={on}
                      onClick={() => toggle(slug)}
                    >
                      <Icon name={on ? 'check' : cat.icon} />
                      <span className="sr">{cat.short}: </span>
                      {tagMap.get(slug)?.label ?? slug}
                      {starred.has(slug) && (
                        <>
                          <Icon name="star" className="fill" />
                          <span className="sr"> (starred)</span>
                        </>
                      )}
                    </button>
                  </span>
                );
              })}
            </div>
            <span className="counter small" role="status" style={{ fontWeight: 700, color: 'var(--u-ink)' }}>
              {picked.length} of 5 picked
            </span>
            {errors.habits && (
              <span className="err">
                <Icon name="alert" />
                {errors.habits}
              </span>
            )}
          </div>
          <div className="foot-btns" style={{ justifyContent: 'flex-end' }}>
            <Btn variant="btn-quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Btn>
            <Btn variant="btn-amber" type="submit" icon="plus" busy={busy} busyLabel="Creating…">
              Create Group
            </Btn>
          </div>
        </form>
      </div>
    </dialog>
  );
}

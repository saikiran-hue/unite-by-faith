'use client';

import { useEffect, useRef, useState } from 'react';
import { CurrentUser, Level, TaxonomyTag } from '@/types/database';
import { CATS } from '@/lib/cats';
import { Btn, CatHead, Empty, HabitChips, Icon, Note, sortHabits } from '@/components/ubf';
import { EditHabitsModal } from '@/components/EditHabitsModal';
import { EDIT_STEPS, PERSONAL_STEP } from '@/lib/edit-habits';

const DEFAULT_LEVEL: Level = 2;

interface HabitsPanelProps {
  user: CurrentUser;
  taxonomyTags: TaxonomyTag[];
  tagMap: Map<string, TaxonomyTag>;
  /** Shows "Habits saved" until the next search. */
  saved: boolean;
  /** Increment to open the editor from elsewhere (e.g. an empty search result). */
  editSignal?: number;
  /** Id of the button that sends editSignal, so focus can go back to it when the modal closes. */
  editOpenerId?: string;
  /** Called after a successful save so matches can be re-scored. */
  onSaved: () => Promise<unknown> | void;
}

export function HabitsPanel({ user, taxonomyTags, tagMap, saved, editSignal = 0, editOpenerId, onSaved }: HabitsPanelProps) {
  // Where the modal opens and which button opened it (focus goes back there), or null when closed.
  // Each open mounts a fresh modal, which reads the saved habits.
  const [editing, setEditing] = useState<{ step: number; opener: string } | null>(null);
  const lastOpener = useRef<string | null>(null);

  useEffect(() => {
    if (editing) lastOpener.current = editing.opener;
    else if (lastOpener.current) {
      (document.getElementById(lastOpener.current) ?? document.getElementById('hab-edit-0'))?.focus();
      lastOpener.current = null;
    }
  }, [editing]);

  const savedPicked = user.tags.map((t) => t.tag_slug);
  const savedStarred = new Set(user.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));
  const savedLevels = new Map(user.tags.map((t) => [t.tag_slug, (t.level ?? DEFAULT_LEVEL) as Level]));
  const savedOwn = user.customTags ?? [];
  const savedTopics = user.personalTopicsLoaded ? user.personalTopics ?? [] : [];

  const openEditor = (step: number, opener: string) => setEditing({ step, opener });

  // Open the editor when the parent asks (adjusting state during render, per React docs).
  const [seenSignal, setSeenSignal] = useState(editSignal);
  if (editSignal !== seenSignal) {
    setSeenSignal(editSignal);
    openEditor(0, editOpenerId ?? (savedPicked.length ? 'hab-edit-0' : 'hab-choose'));
  }

  const modal = editing && (
    <EditHabitsModal
      user={user}
      taxonomyTags={taxonomyTags}
      tagMap={tagMap}
      initialStep={editing.step}
      onSaved={onSaved}
      onClose={() => setEditing(null)}
    />
  );

  /* ---------------- Empty ---------------- */
  if (!savedPicked.length) {
    return (
      <>
        <section className="card pad" aria-labelledby="hab-h">
          <h2 className="h2" id="hab-h">
            My Habits
          </h2>
          <Empty
            icon="star"
            title="Pick Your First Habits"
            text="Habits are the things you do and love. Pick at least 3 and we will match you with people who share them, faith first."
          >
            <Btn
              variant="btn-amber"
              icon="plus"
              id="hab-choose"
              aria-haspopup="dialog"
              onClick={() => openEditor(0, 'hab-choose')}
            >
              Choose Habits
            </Btn>
          </Empty>
        </section>
        {modal}
      </>
    );
  }

  /* ---------------- View ---------------- */
  return (
    <>
      <section className="card pad" aria-labelledby="hab-h">
        <h2 className="h2" id="hab-h">
          My Habits
        </h2>
        <p className="sub">
          {savedPicked.length} habits, {savedStarred.size} starred. Starred habits count double.
        </p>
        {saved && (
          <Note style={{ marginTop: 12 }}>Habits saved. Tap Search to see new matches.</Note>
        )}
        <div className="cats four" style={{ marginTop: 16 }}>
          {CATS.map((c) => {
            const i = EDIT_STEPS.findIndex((x) => x.id === c.key);
            const mine = sortHabits(
              savedPicked.filter((s) => tagMap.get(s)?.category === c.key),
              tagMap,
              savedStarred
            );
            const mineOwn = savedOwn.filter((o) => o.category === c.key);
            return (
              <div key={c.key} className={`cat spot cat-${c.key}`}>
                <CatHead
                  cat={c}
                  extra={
                    <button
                      type="button"
                      className="icon-btn cat-edit"
                      id={`hab-edit-${i}`}
                      aria-haspopup="dialog"
                      aria-label={`Edit ${c.name}`}
                      title={`Edit ${c.name}`}
                      onClick={() => openEditor(i, `hab-edit-${i}`)}
                    >
                      <Icon name="pencil" />
                    </button>
                  }
                />
                {mine.length || mineOwn.length ? (
                  <HabitChips
                    slugs={mine}
                    tagMap={tagMap}
                    starred={savedStarred}
                    levels={savedLevels}
                    own={mineOwn}
                  />
                ) : (
                  <p className="small">None picked yet.</p>
                )}
              </div>
            );
          })}
          {savedTopics.length > 0 && (
            <div className="cat spot cat-personal">
              <div className="cat-head">
                <span className="cat-ic">
                  <Icon name="bulb" />
                </span>
                <div className="grow">
                  <h3 className="cat-name">Personal</h3>
                  <p className="small" style={{ fontSize: 12 }}>
                    Your matches can see these
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn cat-edit"
                  id={`hab-edit-${PERSONAL_STEP}`}
                  aria-haspopup="dialog"
                  aria-label="Edit Personal"
                  title="Edit Personal"
                  onClick={() => openEditor(PERSONAL_STEP, `hab-edit-${PERSONAL_STEP}`)}
                >
                  <Icon name="pencil" />
                </button>
              </div>
              <ul className="chips" style={{ marginTop: 14 }}>
                {savedTopics.map((t) => (
                  <li key={t.label} className="chip">
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      {modal}
    </>
  );
}

'use client';

import type { CustomTag, Level, TaxonomyTag } from '@/types/database';
import type { Cat } from '@/lib/cats';
import { habitList, TOP_N } from '@/lib/habit-list';
import { Btn, CatHead, Icon } from '@/components/ubf';
import { CategorySearch, type OwnHabit } from '@/components/OwnHabits';

export const MAX_STARRED = 3;
export const DEFAULT_LEVEL: Level = 2;
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

interface HabitPickerProps {
  cat: Cat;
  taxonomyTags: TaxonomyTag[];
  picked: string[];
  starred: string[];
  onToggle: (slug: string) => void;
  onStar: (slug: string) => void;
  /** Every own habit being edited, all categories. */
  own: OwnHabit[];
  setOwn: (next: OwnHabit[]) => void;
  savedOwn: CustomTag[];
  allowOwn: boolean;
  expanded: boolean;
  onExpand: (open: boolean) => void;
  /** Shows a level control under each picked habit. Leave out to hide it. */
  levels?: { value: Record<string, Level>; onChange: (slug: string, v: Level) => void };
  /** Shown at the end of the category heading. */
  headExtra?: React.ReactNode;
}

/** One category's habits: heading, search with "Add your own", the top list with Show All, stars and levels. */
export function HabitPicker({
  cat,
  taxonomyTags,
  picked,
  starred,
  onToggle,
  onStar,
  own,
  setOwn,
  savedOwn,
  allowOwn,
  expanded,
  onExpand,
  levels,
  headExtra,
}: HabitPickerProps) {
  const { shown, groups, total } = habitList(taxonomyTags, cat.key, picked);
  const starFull = starred.length >= MAX_STARRED;

  const renderTag = (t: TaxonomyTag) => {
    const on = picked.includes(t.slug);
    const st = starred.includes(t.slug);
    const chip = (
      <span key={t.slug} className={`tchip${on ? ' on' : ''}`}>
        <button type="button" className="t-main" aria-pressed={on} onClick={() => onToggle(t.slug)}>
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
            onClick={() => onStar(t.slug)}
          >
            <Icon name="star" className={st ? 'fill' : undefined} />
          </button>
        )}
      </span>
    );
    if (!levels) return chip;
    return (
      <span key={t.slug} className="tpick">
        {chip}
        {on && (
          <LevelControl
            label={t.label}
            value={levels.value[t.slug] ?? DEFAULT_LEVEL}
            onChange={(v) => levels.onChange(t.slug, v)}
          />
        )}
      </span>
    );
  };

  return (
    <>
      <CatHead cat={cat} extra={headExtra} />
      <CategorySearch
        key={cat.key}
        cat={cat}
        picked={picked}
        onPick={onToggle}
        own={own}
        setOwn={setOwn}
        saved={savedOwn}
        allowOwn={allowOwn}
      />
      {expanded ? (
        groups.map(([name, tags]) => (
          <div key={name}>
            {name && <h4 className="subgroup">{name}</h4>}
            <div className="tchips">{tags.map(renderTag)}</div>
          </div>
        ))
      ) : (
        <div className="tchips">{shown.map(renderTag)}</div>
      )}
      {total > TOP_N && (
        <Btn variant="btn-quiet" className="more-btn" aria-expanded={expanded} onClick={() => onExpand(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${total}`}
        </Btn>
      )}
    </>
  );
}

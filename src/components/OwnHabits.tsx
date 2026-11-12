'use client';

import { useRef } from 'react';
import type { CustomTag, PillarCategory } from '@/types/database';
import type { Cat } from '@/lib/cats';
import { Icon } from '@/components/ubf';
import { TagSearch } from '@/components/TagSearch';
import { MAX_CUSTOM_PER_CATEGORY, MAX_CUSTOM_TOTAL } from '@/lib/profile-update';

export interface OwnHabit {
  category: PillarCategory;
  label: string;
}

const same = (a: OwnHabit, b: OwnHabit) => a.category === b.category && a.label.toLowerCase() === b.label.toLowerCase();

/** True when the own-habit lists differ (order ignored). */
export function ownChanged(a: OwnHabit[], b: OwnHabit[]): boolean {
  return a.length !== b.length || a.some((x) => !b.some((y) => same(x, y)));
}

/**
 * Whether a save should send customTags: when the set changed, or when a saved one has no mapping yet
 * (so the server can try mapping it again; this also covers removing and re-adding the same words).
 * Never when own habits failed to load, so a save can't clear them.
 */
export function shouldSendOwn(own: OwnHabit[], saved: CustomTag[], loaded: boolean): boolean {
  if (!loaded) return false;
  return ownChanged(own, saved) || saved.some((s) => s.mapped.length === 0 && own.some((o) => same(o, s)));
}

interface CategorySearchProps {
  cat: Cat;
  picked: string[];
  onPick: (slug: string) => void;
  /** Every own habit being edited, all categories. */
  own: OwnHabit[];
  setOwn: (next: OwnHabit[]) => void;
  /** Saved own habits, for the matching hint. */
  saved: CustomTag[];
  /** False hides "Add your own" (own habits could not be loaded). */
  allowOwn: boolean;
}

/** One category's search box, its "Add your own" button, and the own habits added in that category. */
export function CategorySearch({ cat, picked, onPick, own, setOwn, saved, allowOwn }: CategorySearchProps) {
  const box = useRef<HTMLDivElement>(null);
  const mine = own.filter((o) => o.category === cat.key);
  const roomLeft = mine.length < MAX_CUSTOM_PER_CATEGORY && own.length < MAX_CUSTOM_TOTAL;

  function remove(o: OwnHabit) {
    setOwn(own.filter((x) => !same(x, o)));
    // The chip's button goes away, so return focus to this category's search box.
    box.current?.querySelector<HTMLInputElement>('input')?.focus();
  }

  function hint(o: OwnHabit): string | null {
    const s = saved.find((x) => same(x, o));
    if (!s) return null;
    // Own habits are private to the member, so the copy must not suggest others can see them.
    return s.mapped.length ? `Matched like: ${s.mapped.map((m) => m.label).join(', ')}` : 'Only on your profile';
  }

  return (
    <div ref={box} className="cat-search">
      <TagSearch
        category={cat.key}
        label={`Search ${cat.name}`}
        picked={picked}
        onPick={onPick}
        taken={mine.map((o) => o.label)}
        onAddCustom={allowOwn && roomLeft ? (label) => setOwn([...own, { category: cat.key, label }]) : undefined}
      />
      {mine.length > 0 && (
        <div className="tchips own-list">
          {mine.map((o) => {
            const h = hint(o);
            return (
              <span key={o.label} className="tpick">
                <span className="tchip own">
                  <span className="t-main">
                    {o.label}
                    <span className="sr"> (your own)</span>
                  </span>
                  <button type="button" className="t-x" aria-label={`Remove ${o.label}`} onClick={() => remove(o)}>
                    <Icon name="x" />
                  </button>
                </span>
                {h && <span className="own-hint">{h}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

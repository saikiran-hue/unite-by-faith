'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ubf';
import { GEONAMES_ATTRIBUTION } from '@/lib/attribution';
import {
  DISTANCES,
  FAITH_STAGES,
  LIFE_STAGES,
  MAX_LANGUAGES,
  MEET_MODES,
  SLOT_DAYS,
  SLOT_TIMES,
  type LifeFitId,
  type LifeFitValue,
} from '@/lib/life-fit';
import type { City, Slot, Tradition } from '@/types/database';

const GENDERS = [['man', 'Man'], ['woman', 'Woman']] as const;

const LANGUAGES = [
  'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'uk', 'pl', 'ar', 'he', 'fa', 'tr', 'hi', 'bn', 'ta', 'te', 'ml',
  'kn', 'mr', 'gu', 'pa', 'ur', 'ne', 'si', 'zh', 'ja', 'ko', 'th', 'vi', 'id', 'tl', 'sw', 'am',
];

const names = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
const regions = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const langName = (code: string) => {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
};
const countryName = (code: string) => {
  try {
    return regions?.of(code) ?? code;
  } catch {
    return code;
  }
};
const prettyFamily = (f: string) => {
  const s = f.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Props {
  value: LifeFitValue;
  onChange: (next: LifeFitValue) => void;
  errors: Partial<Record<LifeFitId, string>>;
  clearError: (id: LifeFitId) => void;
  traditions: Tradition[];
  birthDate: string | null;
}

/** The "Life fit" fields: where, when and how someone can meet, plus faith stage and private match limits. */
export function LifeFitFields({ value: v, onChange, errors, clearError, traditions, birthDate }: Props) {
  const set = (patch: Partial<LifeFitValue>, id?: LifeFitId) => {
    onChange({ ...v, ...patch });
    if (id) clearError(id);
  };

  const err = (id: LifeFitId) =>
    errors[id] ? (
      <span className="hint" id={`pf-${id}-err`} role="alert" style={{ color: 'var(--u-danger)' }}>
        {errors[id]}
      </span>
    ) : null;
  const desc = (id: LifeFitId, hasHint = false) =>
    [errors[id] ? `pf-${id}-err` : null, hasHint ? `pf-${id}-hint` : null].filter(Boolean).join(' ') || undefined;

  const families = useMemo(() => {
    const m = new Map<string, Tradition[]>();
    for (const t of traditions) m.set(t.family, [...(m.get(t.family) ?? []), t]);
    return [...m.entries()];
  }, [traditions]);

  const langs = useMemo(() => [...new Set([...LANGUAGES, ...v.languages])], [v.languages]);
  const langFull = v.languages.length >= MAX_LANGUAGES;

  function toggleLang(code: string) {
    const on = v.languages.includes(code);
    if (!on && langFull) return;
    set({ languages: on ? v.languages.filter((c) => c !== code) : [...v.languages, code] }, 'languages');
  }
  function toggleSlot(s: Slot) {
    set({ availability: v.availability.includes(s) ? v.availability.filter((x) => x !== s) : [...v.availability, s] }, 'slots');
  }

  return (
    <div className="form">
      {birthDate && (
        <div className="field">
          <span className="legend">Date of birth</span>
          <span className="hint">
            {new Date(`${birthDate}T00:00:00Z`).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' })}. Set at
            sign-up and can’t be changed. Only you can see this.
          </span>
        </div>
      )}

      <div className="field">
        <label htmlFor="pf-lifestage">Life stage</label>
        <span className="hint">Required</span>
        <select
          className="input"
          id="pf-lifestage"
          value={v.lifeStage}
          aria-invalid={errors.lifestage ? true : undefined}
          aria-describedby={desc('lifestage')}
          onChange={(e) => set({ lifeStage: e.target.value as LifeFitValue['lifeStage'] }, 'lifestage')}
        >
          <option value="">Choose…</option>
          {LIFE_STAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {err('lifestage')}
      </div>

      <CityField value={v} set={set} error={errors.city} describedBy={desc('city', true)} err={err('city')} />

      <Radios
        id="meet"
        label="How you’d like to meet"
        options={MEET_MODES}
        value={v.meetMode}
        onPick={(k) => set({ meetMode: k as LifeFitValue['meetMode'] }, 'meet')}
        error={err('meet')}
        describedBy={desc('meet')}
      />

      <Radios
        id="distance"
        label="How far you’d travel"
        hint="Only you can see this."
        options={DISTANCES.map((d) => [String(d), `${d} km`])}
        value={String(v.maxDistanceKm)}
        onPick={(k) => set({ maxDistanceKm: Number(k) }, 'distance')}
        error={err('distance')}
        describedBy={desc('distance', true)}
      />

      <div className="field" role="group" aria-labelledby="pf-slots-l" id="pf-slots" tabIndex={-1} aria-describedby={desc('slots')}>
        <span className="legend" id="pf-slots-l">
          When you’re usually free
        </span>
        <div className="lf-slots">
          {SLOT_DAYS.map((day) => (
            <React.Fragment key={day}>
              <span className="small lf-day" aria-hidden="true">
                {day === 'weekday' ? 'Weekday' : 'Weekend'}
              </span>
              {SLOT_TIMES.map((time) => {
                const slot = `${day}_${time}` as Slot;
                const on = v.availability.includes(slot);
                return (
                  <span key={slot} className={`tchip${on ? ' on' : ''}`}>
                    <button
                      type="button"
                      className="t-main"
                      aria-pressed={on}
                      aria-label={`${day === 'weekday' ? 'Weekday' : 'Weekend'} ${time}`}
                      onClick={() => toggleSlot(slot)}
                    >
                      {time.charAt(0).toUpperCase() + time.slice(1)}
                    </button>
                  </span>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        {err('slots')}
      </div>

      <div className="field" role="group" aria-labelledby="pf-languages-l" id="pf-languages" tabIndex={-1} aria-describedby={desc('languages', true)}>
        <span className="legend" id="pf-languages-l">
          Languages
        </span>
        <span className="hint" id="pf-languages-hint">
          Required. Pick 1 to {MAX_LANGUAGES}. {v.languages.length} picked.
          {langFull && ' That is the limit. Remove one to add another.'}
        </span>
        <div className="tchips">
          {langs.map((code) => {
            const on = v.languages.includes(code);
            return (
              <span key={code} className={`tchip${on ? ' on' : ''}`}>
                <button
                  type="button"
                  className="t-main"
                  aria-pressed={on}
                  aria-disabled={!on && langFull ? true : undefined}
                  onClick={() => toggleLang(code)}
                >
                  <Icon name={on ? 'check' : 'plus'} />
                  {langName(code)}
                </button>
              </span>
            );
          })}
        </div>
        {err('languages')}
      </div>

      <div className="field">
        <label htmlFor="pf-tradition">Church tradition</label>
        <span className="hint">Required</span>
        <select
          className="input"
          id="pf-tradition"
          value={v.traditionId}
          aria-invalid={errors.tradition ? true : undefined}
          aria-describedby={desc('tradition')}
          onChange={(e) => set({ traditionId: e.target.value }, 'tradition')}
        >
          <option value="">Choose…</option>
          {families.map(([family, list]) => (
            <optgroup key={family} label={prettyFamily(family)}>
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {err('tradition')}
        <label className="lf-check">
          <input
            type="checkbox"
            checked={v.onlyMyTradition}
            onChange={(e) => set({ onlyMyTradition: e.target.checked })}
          />
          Only match people from my tradition
        </label>
      </div>

      <Radios
        id="faith"
        label="Where you are in your faith"
        required
        options={FAITH_STAGES}
        value={v.faithStage}
        onPick={(k) => set({ faithStage: k as LifeFitValue['faithStage'] }, 'faith')}
        error={err('faith')}
        describedBy={desc('faith', true)}
      />

      <Radios
        id="gender"
        label="Gender"
        hint="Used only so 1v1 matches are same-gender. Never shown. Only you can see this."
        required
        options={GENDERS}
        value={v.gender}
        onPick={(k) => set({ gender: k as LifeFitValue['gender'] }, 'gender')}
        error={err('gender')}
        describedBy={desc('gender', true)}
      />

      <div className="field" role="group" aria-labelledby="pf-age-l">
        <span className="legend" id="pf-age-l">
          Ages you’d like to meet
        </span>
        <span className="hint" id="pf-age-hint">
          Required. Only you can see this.
        </span>
        <div className="two">
          <div className="field">
            <label htmlFor="pf-agemin">From</label>
            <input
              className="input"
              id="pf-agemin"
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              value={v.ageMin}
              aria-invalid={errors.agemin ? true : undefined}
              aria-describedby={[desc('agemin'), 'pf-age-hint'].filter(Boolean).join(' ')}
              onChange={(e) => {
                set({ ageMin: e.target.value }, 'agemin');
                clearError('agemax');
              }}
            />
            {err('agemin')}
          </div>
          <div className="field">
            <label htmlFor="pf-agemax">To</label>
            <input
              className="input"
              id="pf-agemax"
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              value={v.ageMax}
              aria-invalid={errors.agemax ? true : undefined}
              aria-describedby={[desc('agemax'), 'pf-age-hint'].filter(Boolean).join(' ')}
              onChange={(e) => {
                set({ ageMax: e.target.value }, 'agemax');
                clearError('agemin');
              }}
            />
            {err('agemax')}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Single choice shown as chips, with arrow-key movement (roving tabindex). */
function Radios({
  id,
  label,
  hint,
  required,
  options,
  value,
  onPick,
  error,
  describedBy,
}: {
  id: LifeFitId;
  label: string;
  hint?: string;
  required?: boolean;
  options: readonly (readonly [string, string])[];
  value: string;
  onPick: (key: string) => void;
  error: React.ReactNode;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.max(0, options.findIndex(([k]) => k === value));

  function onKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + options.length) % options.length;
    onPick(options[n][0]);
    refs.current[n]?.focus();
  }

  return (
    <div className="field">
      <span className="legend" id={`pf-${id}-l`}>
        {label}
      </span>
      {(hint || required) && (
        <span className="hint" id={`pf-${id}-hint`}>
          {[required ? 'Required.' : null, hint].filter(Boolean).join(' ')}
        </span>
      )}
      <div
        className="tchips"
        role="radiogroup"
        id={`pf-${id}`}
        tabIndex={-1}
        aria-labelledby={`pf-${id}-l`}
        aria-describedby={describedBy}
      >
        {options.map(([k, l], i) => {
          const on = k === value;
          return (
            <span key={k} className={`tchip${on ? ' on' : ''}`}>
              <button
                type="button"
                className="t-main"
                role="radio"
                aria-checked={on}
                tabIndex={i === active ? 0 : -1}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                onClick={() => onPick(k)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {l}
              </button>
            </span>
          );
        })}
      </div>
      {error}
    </div>
  );
}

/** City combobox: type, then pick from the list. Typing again drops the previous pick. */
function CityField({
  value: v,
  set,
  error,
  describedBy,
  err,
}: {
  value: LifeFitValue;
  set: (patch: Partial<LifeFitValue>, id?: LifeFitId) => void;
  error?: string;
  describedBy?: string;
  err: React.ReactNode;
}) {
  const [text, setText] = useState(v.cityName);
  const [found, setFound] = useState<{ q: string; cities: City[]; failed: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const q = text.trim();
  const searching = v.cityId === null && q.length >= 2;
  const current = searching && found?.q === q ? found : null;
  const hits = current?.cities ?? [];
  const status = !searching ? 'idle' : !current ? 'loading' : current.failed ? 'error' : hits.length ? 'idle' : 'none';

  useEffect(() => {
    if (!searching) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('bad');
        const data = (await res.json()) as { cities: City[] };
        if (!stale) setFound({ q, cities: data.cities, failed: false });
      } catch {
        if (!stale) setFound({ q, cities: [], failed: true });
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, searching]);

  function pick(c: City) {
    setText(c.name);
    setOpen(false);
    setCursor(-1);
    set({ cityId: c.id, cityName: c.name }, 'city');
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && hits.length) {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp' && hits.length) {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? hits.length - 1 : c - 1));
    } else if (e.key === 'Enter' && open && cursor >= 0) {
      e.preventDefault();
      pick(hits[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const listOpen = open && hits.length > 0 && v.cityId === null;
  const msg =
    v.cityId !== null
      ? `${v.cityName} selected.`
      : status === 'loading'
        ? 'Searching…'
        : status === 'none'
          ? 'No city found. Check the spelling.'
          : status === 'error'
            ? 'We couldn’t search cities. Try again.'
            : listOpen
              ? `${hits.length} cities found.`
              : '';

  return (
    <div className="field">
      <label htmlFor="pf-city">Your city</label>
      <span className="hint" id="pf-city-hint">
        Required. Pick from the list. {GEONAMES_ATTRIBUTION}
      </span>
      <div className="lf-combo">
        <input
          className="input"
          id="pf-city"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? 'pf-city-list' : undefined}
          aria-activedescendant={listOpen && cursor >= 0 ? `pf-city-o${cursor}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder="Start typing, e.g. Pune"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setCursor(-1);
            set({ cityId: null }, 'city');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKey}
        />
        {listOpen && (
          <ul className="lf-list card" id="pf-city-list" role="listbox" aria-label="Cities">
            {hits.map((c, i) => (
              <li
                key={c.id}
                id={`pf-city-o${i}`}
                role="option"
                aria-selected={i === cursor}
                className={i === cursor ? 'on' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
              >
                {c.name}
                <span className="small">, {countryName(c.country_code)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="hint" role="status" style={{ minHeight: msg ? undefined : 0 }}>
        {msg}
      </span>
      {err}
    </div>
  );
}

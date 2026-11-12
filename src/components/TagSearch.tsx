'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PillarCategory } from '@/types/database';
import { Btn, Icon } from '@/components/ubf';
import { titleCaseLabel, validCustomLabel } from '@/lib/profile-update';

interface Hit {
  slug: string;
  label: string;
  category: PillarCategory;
  subgroup?: string;
}

type Result =
  | { kind: 'idle' }
  | { kind: 'hits'; source: 'text' | 'meaning'; tags: Hit[] }
  | { kind: 'none' }
  | { kind: 'error' };

const DEBOUNCE_MS = 250;

interface TagSearchProps {
  category?: PillarCategory;
  picked: string[];
  onPick: (slug: string) => void;
  /** Visible label for the search box. */
  label?: string;
  /** Offers "Add “…” as your own" for the typed words. Leave out to hide it. */
  onAddCustom?: (label: string) => void;
  /** Own habits already added here, so the same words aren't offered twice. */
  taken?: string[];
}

/** Search the habit catalogue by words or meaning; results are pickable chips. */
export function TagSearch({ category, picked, onPick, label = 'Search habits', onAddCustom, taken = [] }: TagSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
    },
    []
  );

  async function run(q: string, mine: number) {
    try {
      const cat = category ? `&category=${category}` : '';
      const res = await fetch(`/api/tags/search?q=${encodeURIComponent(q)}${cat}`);
      if (mine !== seq.current) return;
      setLoading(false);
      if (!res.ok) {
        setResult({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as { source: 'text' | 'meaning' | 'none'; tags: Hit[] };
      if (mine !== seq.current) return;
      const tags = data.tags ?? [];
      setResult(data.source === 'none' || !tags.length ? { kind: 'none' } : { kind: 'hits', source: data.source, tags });
    } catch {
      if (mine === seq.current) {
        setLoading(false);
        setResult({ kind: 'error' });
      }
    }
  }

  function onChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    const mine = ++seq.current;
    if (!q) {
      setLoading(false);
      setResult({ kind: 'idle' });
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => void run(q, mine), DEBOUNCE_MS);
  }

  const own = titleCaseLabel(query);
  const ownKey = own.toLowerCase();
  const canAdd =
    !!onAddCustom &&
    !loading &&
    result.kind !== 'idle' &&
    validCustomLabel(query) &&
    !taken.some((t) => t.toLowerCase() === ownKey) &&
    !(result.kind === 'hits' && result.tags.some((t) => t.label.toLowerCase() === ownKey));

  function addCustom() {
    onAddCustom?.(own);
    onChange('');
    // The button unmounts once the query clears, so put focus back on the search box.
    inputRef.current?.focus();
  }

  let status = '';
  if (loading) status = 'Searching…';
  else if (result.kind === 'none') {
    status = onAddCustom ? "We don't have that yet. Add it as your own." : "We don't have that yet. We've noted it.";
  }
  else if (result.kind === 'error') status = "Search isn't working right now. Try again in a moment.";
  else if (result.kind === 'hits') status = `${result.tags.length} found`;

  return (
    <div className="tsearch field">
      <label htmlFor={`${id}-q`}>{label}</label>
      <input
        ref={inputRef}
        id={`${id}-q`}
        className="input"
        type="search"
        autoComplete="off"
        placeholder="Try “climbing” or “quiet mornings”"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-s`}
      />
      <div id={`${id}-s`} role="status" className={result.kind === 'hits' ? 'sr' : 'hint'}>
        {status}
      </div>
      {result.kind === 'hits' && (
        <>
          {result.source === 'meaning' && <p className="did-you">Did you mean…</p>}
          <div className="tchips">
            {result.tags.map((t) => {
              const on = picked.includes(t.slug);
              return (
                <span key={t.slug} className={`tchip${on ? ' on' : ''}`}>
                  <button type="button" className="t-main" aria-pressed={on} onClick={() => !on && onPick(t.slug)}>
                    <Icon name={on ? 'check' : 'plus'} />
                    {t.label}
                  </button>
                </span>
              );
            })}
          </div>
        </>
      )}
      {canAdd && (
        <Btn variant="btn-outline" icon="plus" className="add-own" onClick={addCustom}>
          Add “{own}” as your own
        </Btn>
      )}
    </div>
  );
}

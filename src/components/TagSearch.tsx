'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PillarCategory } from '@/types/database';
import { Icon } from '@/components/ubf';

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
}

/** Search the habit catalogue by words or meaning; results are pickable chips. */
export function TagSearch({ category, picked, onPick }: TagSearchProps) {
  const id = useId();
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
      const res = await fetch(`/api/tags/search?q=${encodeURIComponent(q)}`);
      if (mine !== seq.current) return;
      setLoading(false);
      if (!res.ok) {
        setResult({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as { source: 'text' | 'meaning' | 'none'; tags: Hit[] };
      if (mine !== seq.current) return;
      const tags = (data.tags ?? []).filter((t) => !category || t.category === category);
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

  let status = '';
  if (loading) status = 'Searching…';
  else if (result.kind === 'none') status = "We don't have that yet. We've noted it.";
  else if (result.kind === 'error') status = "Search isn't working right now. Try again in a moment.";
  else if (result.kind === 'hits') status = `${result.tags.length} found`;

  return (
    <div className="tsearch field">
      <label htmlFor={`${id}-q`}>Search habits</label>
      <input
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
    </div>
  );
}

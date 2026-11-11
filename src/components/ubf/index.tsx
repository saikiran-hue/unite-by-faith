'use client';

/**
 * Building blocks of the Unite by Faith design system ("soft bento").
 * Markup and class names mirror the design prototype one to one; styles live
 * in globals.css under `.ubf`.
 */

import React, { useEffect, useState } from 'react';
import { ICON_PATHS, type IconName } from './icon-paths';
import type { TaxonomyTag } from '@/types/database';
import { CAT_BY_KEY, CATS, type Cat } from '@/lib/cats';
import { THEME_KEY } from './theme-script';

export type { IconName };

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`ic${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/** Rose window: the logo (pct omitted) or a match score (panes lit in proportion). */
export function Rose({ size, pct }: { size: number; pct?: number }) {
  const lit = pct == null ? 8 : Math.max(1, Math.round(pct / 12.5));
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22.3" style={{ fill: 'none', stroke: 'var(--rose-ring, var(--u-ink))', strokeWidth: 2.6 }} />
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse
          key={i}
          cx="24"
          cy="11.8"
          rx="3.7"
          ry="6.3"
          style={{ fill: i < lit ? 'var(--rose-lit, var(--u-ink))' : 'var(--rose-off, var(--u-line))' }}
          transform={`rotate(${i * 45} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="3.6" style={{ fill: 'var(--rose-hub, var(--u-accent))' }} />
    </svg>
  );
}

/** Match % pill. Counts up from 0 when `countUp` is set (skipped under reduced motion). */
export function ScorePill({ pct, countUp, className }: { pct: number; countUp?: boolean; className?: string }) {
  const [shown, setShown] = useState(pct);
  useEffect(() => {
    if (!countUp || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let t0: number | null = null;
    const tick = (t: number) => {
      if (t0 == null) t0 = t;
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(pct * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct, countUp]);
  return (
    <span className={`score${className ? ` ${className}` : ''}`}>
      <Rose size={22} pct={pct} />
      <span>
        <span>{shown}</span>%<span className="sr"> match</span>
      </span>
    </span>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

/** Pill button with optional icon and busy state, as in the prototype's btn(). */
export function Btn({
  variant,
  icon,
  busy,
  busyLabel,
  children,
  className,
  type = 'button',
  ...rest
}: {
  variant: string;
  icon?: IconName;
  busy?: boolean;
  busyLabel?: string;
  className?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button
      type={type}
      className={`btn ${variant}${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </button>
  );
}

export function AlertBox({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="alert" role="alert">
      <Icon name="alert" />
      <div>
        <b>{title}</b>
        {text}
        {action && (
          <div>
            <Btn variant="btn-quiet" onClick={action.onClick}>
              {action.label}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="e-ic">
        <Icon name={icon} />
      </span>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Note({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p className="note" role="status" style={style}>
      <Icon name="check" />
      {children}
    </p>
  );
}

/** Category header with icon disc, weight line, Core tag and weight bar. */
export function CatHead({ cat, extra }: { cat: Cat; extra?: React.ReactNode }) {
  return (
    <>
      <div className="cat-head">
        <span className="cat-ic">
          <Icon name={cat.icon} />
        </span>
        <div className="grow">
          <h3 className="cat-name">{cat.name}</h3>
          <p className="small" style={{ fontSize: 12 }}>
            {cat.weight}% of your match
          </p>
        </div>
        {cat.key === 'faith' && <span className="tag core">Core</span>}
        {extra}
      </div>
      <div className="wbar" aria-hidden="true">
        <i style={{ width: `${cat.weight * 2.5}%` }} />
      </div>
    </>
  );
}

/** Read-only habit chip with its category icon and an optional star. */
export function HabitChip({ slug, tagMap, starred }: { slug: string; tagMap: Map<string, TaxonomyTag>; starred?: boolean }) {
  const tag = tagMap.get(slug);
  const cat = tag ? CAT_BY_KEY[tag.category] : CATS[0];
  return (
    <li className={`chip cat-${cat.key}`}>
      <Icon name={cat.icon} />
      <span className="sr">{cat.short}: </span>
      {tag?.label ?? slug}
      {starred && (
        <>
          <Icon name="star" className="fill star" />
          <span className="sr"> (most important)</span>
        </>
      )}
    </li>
  );
}

export function HabitChips({
  slugs,
  tagMap,
  starred,
  max,
}: {
  slugs: string[];
  tagMap: Map<string, TaxonomyTag>;
  starred?: Set<string>;
  max?: number;
}) {
  const shown = max ? slugs.slice(0, max) : slugs;
  return (
    <ul className="chips">
      {shown.map((s) => (
        <HabitChip key={s} slug={s} tagMap={tagMap} starred={starred?.has(s)} />
      ))}
      {max && slugs.length > max && <li className="chip more">+{slugs.length - max} more</li>}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export function ThemeButton() {
  // Server render has no theme; read it after mount.
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: theme still switches for this visit */
    }
  }
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={dark === null ? 'Switch colour theme' : `Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      {/* Both icons render; CSS shows the one for the current theme from the first frame. */}
      <Icon name="moon" className="th-moon" />
      <Icon name="sun" className="th-sun" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Habit helpers                                                       */
/* ------------------------------------------------------------------ */

/** Starred first, then by category order (faith first). */
export function sortHabits(slugs: string[], tagMap: Map<string, TaxonomyTag>, starred?: Set<string>) {
  const order = (s: string) => {
    const c = tagMap.get(s)?.category;
    return c ? CAT_BY_KEY[c].order : CATS.length;
  };
  return [...slugs].sort(
    (a, b) => Number(starred?.has(b) ?? 0) - Number(starred?.has(a) ?? 0) || order(a) - order(b)
  );
}

/** "You both share A and B." — B is from a different category when possible. */
export function reasonLine(shared: string[], tagMap: Map<string, TaxonomyTag>) {
  if (!shared.length) return '';
  const sorted = sortHabits(shared, tagMap);
  const label = (s: string) => tagMap.get(s)?.label ?? s;
  const a = sorted[0];
  const catA = tagMap.get(a)?.category;
  const b = sorted.slice(1).find((s) => tagMap.get(s)?.category !== catA) ?? sorted[1];
  return `You both share ${label(a)}${b ? ` and ${label(b)}` : ''}.`;
}

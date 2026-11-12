'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './index';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Options sharing a group are listed under that heading (options must be contiguous). */
  group?: string;
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  ariaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
}

/**
 * Styled listbox that replaces native <select> popups (WAI-ARIA select-only combobox).
 * The trigger button carries `id`, so labels and focus-on-error keep working.
 */
export function Select({ id, value, onChange, options, placeholder = 'Choose…', invalid, describedBy, ariaLabel, labelledBy, disabled }: Props) {
  const uid = useId();
  const listId = `${id}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const [shift, setShift] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', t: 0 });

  const selIndex = options.findIndex((o) => o.value === value);
  const selected = selIndex >= 0 ? options[selIndex] : null;

  function show() {
    if (disabled) return;
    setActive(selIndex >= 0 ? selIndex : 0);
    setOpen(true);
  }
  function close(refocus = false) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }
  function pick(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    close(true);
  }

  // Flip above when there is no room below; keep the panel inside the viewport sideways.
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !listRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    const h = Math.min(listRef.current.scrollHeight, 280) + 12;
    setAbove(window.innerHeight - r.bottom < h + 8 && r.top > window.innerHeight - r.bottom);
    const w = listRef.current.offsetWidth;
    const vw = document.documentElement.clientWidth;
    let s = 0;
    if (r.left + w > vw - 8) s = vw - 8 - (r.left + w);
    if (r.left + s < 8) s = 8 - r.left;
    setShift(s);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        show();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const i = match(e.key);
        if (i >= 0) onChange(options[i].value);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => Math.min(last, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(last);
        break;
      case 'PageDown':
        e.preventDefault();
        setActive((a) => Math.min(last, a + 6));
        break;
      case 'PageUp':
        e.preventDefault();
        setActive((a) => Math.max(0, a - 6));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(active);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = match(e.key);
          if (i >= 0) setActive(i);
        }
    }
  }

  /** Type-ahead: letters typed in quick succession narrow the match. */
  function match(ch: string) {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.t > 700 ? ch.toLowerCase() : t.text + ch.toLowerCase();
    t.t = now;
    const start = open ? active : Math.max(0, selIndex);
    const order = options.map((_, i) => (start + (t.text.length === 1 ? 1 : 0) + i) % options.length);
    return order.find((i) => options[i].label.toLowerCase().startsWith(t.text)) ?? -1;
  }

  return (
    <div className="sel" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        className="input sel-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <span className={selected ? 'sel-val' : 'sel-val ph'}>{selected ? selected.label : placeholder}</span>
        <Icon name="chevron-down" className="sel-chev" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={`sel-list${above ? ' above' : ''}`}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((o, i) => (
            <React.Fragment key={o.value || `i${i}`}>
              {o.group && o.group !== options[i - 1]?.group && (
                <li role="presentation" className="sel-grp">
                  {o.group}
                </li>
              )}
              <li
                id={optId(i)}
                role="option"
                aria-selected={i === selIndex}
                className={`sel-opt${i === active ? ' act' : ''}${i === selIndex ? ' on' : ''}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="sel-ck">{i === selIndex && <Icon name="check" />}</span>
                <span className="sel-txt">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
              </li>
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { clampDay, daysInMonth, type DateParts } from '@/lib/date-parts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  idPrefix: string;
  value: DateParts;
  onChange: (next: DateParts) => void;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Day / Month / Year dropdowns for a date of birth: three quick picks instead of paging
 * a calendar back decades. The first control gets `${idPrefix}-day` so errors can focus it.
 */
export function BirthDateSelect({ idPrefix, value, onChange, invalid, describedBy }: Props) {
  // Set after mount: reading the clock during render is not allowed here.
  const [thisYear, setThisYear] = useState<number | null>(null);
  useEffect(() => {
    queueMicrotask(() => setThisYear(new Date().getFullYear()));
  }, []);

  const maxDay = value.month ? daysInMonth(Number(value.month), value.year ? Number(value.year) : undefined) : 31;
  const years = thisYear ? Array.from({ length: 101 }, (_, i) => thisYear - i) : [];
  const set = (key: keyof DateParts) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange(clampDay({ ...value, [key]: e.target.value }));

  const part = (key: keyof DateParts, label: string, options: { value: string; label: string }[]) => (
    <label className={`dob-part dob-${key}`} htmlFor={`${idPrefix}-${key}`}>
      <span className="dob-label">{label}</span>
      <select
        className="input"
        id={`${idPrefix}-${key}`}
        value={value[key]}
        onChange={set(key)}
        autoComplete={key === 'day' ? 'bday-day' : key === 'month' ? 'bday-month' : 'bday-year'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <option value="" disabled>
          {label}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="dob">
      {part('day', 'Day', Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })))}
      {part('month', 'Month', MONTHS.map((m, i) => ({ value: String(i + 1), label: m })))}
      {part('year', 'Year', years.map((y) => ({ value: String(y), label: String(y) })))}
    </div>
  );
}

import { VERSES } from './data';

export interface Verse {
  ref: string;
  text: string;
}

/** The local calendar date as `MM-DD`, the key into VERSES. Never UTC: the verse turns at the viewer's midnight. */
export function verseKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The Verse of the Day for the viewer's local date. */
export function verseFor(date: Date): Verse {
  return VERSES[verseKey(date)];
}

/** Milliseconds from `date` until the next local midnight. */
export function msToNextDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - date.getTime();
}

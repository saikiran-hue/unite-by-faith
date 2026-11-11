export const TEXT_MIN = 0.35;
/**
 * Raw gte-small cosine floor for "did you mean". Calibrated on labelled typed queries (task-11 report):
 * genuine matches scored 0.879-0.944 at top-1, unrelated or nonsense queries 0.785-0.823.
 */
export const MEANING_MIN = 0.85;
const TEXT_LIMIT = 8;
const MEANING_LIMIT = 3;

/** Trim, collapse whitespace, lowercase, cap at 60 chars; null when fewer than 2 chars remain. */
export function normaliseQuery(q: string): string | null {
  const s = q.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60).trim();
  return s.length < 2 ? null : s;
}

export type SuggestSource = 'text' | 'meaning' | 'none';

/** Text hits win; otherwise meaning hits; otherwise none. Inputs are assumed ordered best first. */
export function pickSuggestions(
  trgm: { slug: string; score: number }[],
  vec: { slug: string; cos: number }[],
): { source: SuggestSource; slugs: string[] } {
  const text = trgm.filter((r) => r.score >= TEXT_MIN).slice(0, TEXT_LIMIT);
  if (text.length > 0) return { source: 'text', slugs: text.map((r) => r.slug) };
  const meaning = vec.filter((r) => r.cos >= MEANING_MIN).slice(0, MEANING_LIMIT);
  if (meaning.length > 0) return { source: 'meaning', slugs: meaning.map((r) => r.slug) };
  return { source: 'none', slugs: [] };
}

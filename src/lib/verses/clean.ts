const OPEN = '“'; // “
const CLOSE = '”'; // ”
const EM_DASH = '—'; // —

/**
 * Tidies a bible-api.com verse: collapses whitespace, joins an em dash to the word after a poetry
 * line break, and completes a quotation that the verse starts or ends inside, so the marks always
 * nest. The words never change; ‘ and ’ are left alone.
 */
export function cleanVerseText(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/\u2014\s+/g, EM_DASH);
  let depth = 0;
  let unmatchedCloses = 0;
  for (const ch of text) {
    if (ch === OPEN) depth++;
    else if (ch === CLOSE) {
      if (depth === 0) unmatchedCloses++;
      else depth--;
    }
  }
  return OPEN.repeat(unmatchedCloses) + text + CLOSE.repeat(depth);
}

/** Cites a psalm in the standard singular: bible-api.com returns "Psalms 23:4", readers expect "Psalm 23:4". */
export function normalizeRef(ref: string): string {
  return ref.replace(/^Psalms /, 'Psalm ');
}

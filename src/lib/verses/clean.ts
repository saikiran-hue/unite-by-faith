const OPEN = '“'; // “
const CLOSE = '”'; // ”

/**
 * Tidies a bible-api.com verse: collapses whitespace, and completes a quotation that the verse
 * starts or ends inside, so the marks always nest. The words never change; ‘ and ’ are left alone.
 */
export function cleanVerseText(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
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

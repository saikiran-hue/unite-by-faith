import { describe, expect, it } from 'vitest';
import { cleanVerseText, normalizeRef } from './clean';

describe('cleanVerseText', () => {
  it('completes a quotation that is closed but not opened in the verse', () => {
    expect(cleanVerseText('For where two or three gather together in My name, there am I with them.”'))
      .toBe('“For where two or three gather together in My name, there am I with them.”');
  });

  it('collapses newlines and repeated spaces to one space', () => {
    expect(cleanVerseText('Do not be afraid; do not\nbe discouraged,  for the LORD your God is with you.'))
      .toBe('Do not be afraid; do not be discouraged, for the LORD your God is with you.');
  });

  it('joins an em dash to the next word across a poetry line break', () => {
    expect(cleanVerseText('The LORD is my light and my salvation—\n\nwhom shall I fear?'))
      .toBe('The LORD is my light and my salvation—whom shall I fear?');
  });

  it('completes a quotation that is opened but not closed in the verse', () => {
    expect(cleanVerseText('“Come to Me, all you who are weary and burdened, and I will give you rest.'))
      .toBe('“Come to Me, all you who are weary and burdened, and I will give you rest.”');
    expect(cleanVerseText('“For I know the plans I have for you,” declares the LORD, “plans to prosper you.'))
      .toBe('“For I know the plans I have for you,” declares the LORD, “plans to prosper you.”');
  });

  it('completes both edges when the verse starts and ends inside a quotation', () => {
    expect(cleanVerseText('to you,” says the LORD, “and peace.')).toBe('“to you,” says the LORD, “and peace.”');
  });

  it('leaves balanced quotations untouched', () => {
    expect(cleanVerseText('Jesus said, “I am the way.” Amen.')).toBe('Jesus said, “I am the way.” Amen.');
  });

  it('keeps curly apostrophes', () => {
    expect(cleanVerseText('Don’t be afraid.')).toBe('Don’t be afraid.');
  });
});

describe('normalizeRef', () => {
  it('cites a psalm in the singular', () => {
    expect(normalizeRef('Psalms 23:4')).toBe('Psalm 23:4');
    expect(normalizeRef('Psalms 23:1-2')).toBe('Psalm 23:1-2');
  });

  it('leaves every other book untouched', () => {
    expect(normalizeRef('Joshua 1:9')).toBe('Joshua 1:9');
  });
});

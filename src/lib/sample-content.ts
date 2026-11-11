/**
 * SAMPLE CONTENT — placeholder data for UI that has no backend yet.
 *
 * Everything here is shown with a visible "Sample" badge. Replace each block
 * with real data when the feature exists (streaks, faith rhythms, events,
 * message counts). Photos are free Unsplash images; swap them here.
 */

const unsplash = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?w=${w}&auto=format&fit=crop&q=75`;

export const PHOTOS = {
  hero: unsplash('photo-1528825539566-2bcb5882445c', 1600), // cross on a hill at golden hour
  friends: unsplash('photo-1772724317388-4d1d1cc45c09', 900), // friends laughing outdoors
  bible: unsplash('photo-1504052434569-70ad5836ab65'),
  worship: unsplash('photo-1478147427282-58a87a120781'),
  guitar: unsplash('photo-1510915361894-db8b60106cb1'),
  running: unsplash('photo-1594882645126-14020914d58d'),
  books: unsplash('photo-1550399105-c4db5fb85c18'),
  coffee: unsplash('photo-1495474472287-4d71bcdd2085'),
  laptop: unsplash('photo-1484788984921-03950022c9ef'),
};

/** Pick a cover photo for a pod from its title and tags. */
export function podCover(title: string, tags: string[]): string {
  const text = `${title} ${tags.join(' ')}`.toLowerCase();
  if (/guitar|worship|song|music/.test(text)) return PHOTOS.guitar;
  if (/run|marathon|fitness|sport/.test(text)) return PHOTOS.running;
  if (/apolog|book|inkling|tolkien|lewis|theolog|history/.test(text)) return PHOTOS.books;
  if (/coffee|tea|cafe/.test(text)) return PHOTOS.coffee;
  if (/prayer|intercession/.test(text)) return PHOTOS.worship;
  if (/bible|scripture|devotion|word|study|fellowship/.test(text)) return PHOTOS.bible;
  if (/\bai\b|tech|builder|engineer|code|startup|saas/.test(text)) return PHOTOS.laptop;
  return PHOTOS.bible;
}

export const VERSES = {
  hero: {
    text: 'For where two or three gather in my name, there am I with them.',
    ref: 'Matthew 18:20',
  },
};

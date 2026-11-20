// Verse of the Day photo: sky-only top crop (w=2400, h=520, crop=top) of a cross on a hill at golden hour.
// Source: https://unsplash.com/photos/photo-1528825539566-2bcb5882445c (Unsplash License, free to use)
// Group Match photo: four friends at a table.
// Source: https://www.pexels.com/photo/8111273/ (Pexels License, free to use)
export const HOME_PHOTOS = {
  verse: '/images/home/verse-sky.jpg',
  group: '/images/home/group-friends.jpg',
};

// 1v1 Match default photo: hands on open Bibles.
// Source: https://www.pexels.com/photo/6860819/ (Pexels License, free to use)
export const DUO_NEUTRAL = '/images/home/duo-bibles.jpg';

// Gender-specific 1v1 photos; empty until photos pass the spec's rules.
export const DUO_BY_GENDER: Partial<Record<'man' | 'woman', string>> = {};

export function duoPhoto(
  gender: 'man' | 'woman' | null | undefined,
  byGender: Partial<Record<'man' | 'woman', string>> = DUO_BY_GENDER,
): string {
  return (gender && byGender[gender]) || DUO_NEUTRAL;
}

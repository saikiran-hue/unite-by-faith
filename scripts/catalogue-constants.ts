/** Allowed subgroups per category (spec §4.2). Shared by the builder script; scripts/catalogue.test.ts keeps its own copy on purpose. */
export const SUBGROUPS = {
  faith: ['Prayer', 'Scripture', 'Worship', 'Serving', 'Community', 'Learning'],
  hobbies: ['Outdoors', 'Sports', 'Creative', 'Music', 'Games', 'Food', 'Reading'],
  tastes: ['Food & Drink', 'Film & TV', 'Books', 'Music', 'Style & Home', 'Travel'],
  skills: ['Tech', 'Business', 'Creative Work', 'Care & Teaching', 'Trades & Practical'],
} as const;

export type Category = keyof typeof SUBGROUPS;

export const CATEGORY_ORDER: Category[] = ['faith', 'hobbies', 'tastes', 'skills'];

export const TRADITION_FAMILIES = [
  'evangelical',
  'pentecostal_charismatic',
  'reformed_presbyterian',
  'baptist',
  'methodist_wesleyan',
  'anglican_episcopal',
  'lutheran',
  'catholic',
  'eastern_orthodox',
  'oriental_orthodox',
  'mar_thoma_st_thomas',
  'non_denominational',
  'other',
] as const;

export type TraditionFamily = (typeof TRADITION_FAMILIES)[number];

export interface CatalogueTag {
  slug: string;
  label: string;
  category: Category;
  subgroup: string;
  description: string;
  synonyms: string[];
  legacySlugs: string[];
}

export interface Tradition {
  id: string;
  name: string;
  family: TraditionFamily;
}

import { defaultAgeRange, ageOn } from '@/lib/age';
import type { City, CurrentUser, FaithStage, LifeStage, MeetMode, Slot } from '@/types/database';

export interface LifeFitValue {
  cityId: number | null;
  cityName: string;
  meetMode: MeetMode;
  maxDistanceKm: number;
  lifeStage: LifeStage | '';
  availability: Slot[];
  languages: string[];
  traditionId: string;
  onlyMyTradition: boolean;
  faithStage: FaithStage | '';
  gender: 'man' | 'woman' | '';
  ageMin: string;
  ageMax: string;
}

/** Element ids (after the `pf-` prefix) in the order they appear, used to focus the first error. */
export const LIFE_FIT_ORDER = [
  'lifestage', 'city', 'meet', 'distance', 'slots', 'languages', 'tradition', 'faith', 'gender', 'agemin', 'agemax',
] as const;
export type LifeFitId = (typeof LIFE_FIT_ORDER)[number];

/** API field name -> element id. */
export const FIELD_TO_ID: Record<string, LifeFitId> = {
  lifeStage: 'lifestage', cityId: 'city', meetMode: 'meet', maxDistanceKm: 'distance', availability: 'slots',
  languages: 'languages', traditionId: 'tradition', onlyMyTradition: 'tradition', faithStage: 'faith',
  gender: 'gender', ageMin: 'agemin', ageMax: 'agemax',
};

export const LIFE_STAGES: [LifeStage, string][] = [
  ['student', 'Student'],
  ['early_career', 'Early career'],
  ['established_career', 'Established career'],
  ['married_no_kids', 'Married, no kids'],
  ['parent_young_kids', 'Parent of young kids'],
  ['parent_older_kids', 'Parent of older kids'],
];
export const MEET_MODES: [MeetMode, string][] = [['in_person', 'In person'], ['online', 'Online'], ['both', 'Both']];
export const DISTANCES = [10, 25, 50, 100];
export const FAITH_STAGES: [FaithStage, string][] = [
  ['exploring', 'Exploring'],
  ['new_believer', 'New believer'],
  ['growing', 'Growing'],
  ['mature', 'Mature'],
];
export const SLOT_DAYS = ['weekday', 'weekend'] as const;
export const SLOT_TIMES = ['morning', 'afternoon', 'evening'] as const;
export const MAX_LANGUAGES = 6;

/** Starting values from the signed-in user; the age range defaults to six years either side of their own age. */
export function lifeFitFrom(u: CurrentUser | null, city: City | null, today?: Date): LifeFitValue {
  const priv = u?.private ?? null;
  let range: { min: number; max: number } | null = null;
  if (priv?.birth_date) {
    try {
      range = defaultAgeRange(ageOn(priv.birth_date, today ?? new Date()));
    } catch {
      range = null;
    }
  }
  const min = priv?.age_min ?? range?.min;
  const max = priv?.age_max ?? range?.max;
  return {
    cityId: u?.location_city_id ?? null,
    cityName: city?.name ?? '',
    meetMode: u?.meet_mode ?? 'both',
    maxDistanceKm: priv?.max_distance_km ?? 25,
    lifeStage: u?.life_stage ?? '',
    availability: u?.availability ?? [],
    languages: u?.languages ?? [],
    traditionId: u?.tradition_id ?? '',
    onlyMyTradition: priv?.only_my_tradition ?? false,
    faithStage: u?.faith_stage ?? '',
    gender: priv?.gender ?? '',
    ageMin: min != null ? String(min) : '',
    ageMax: max != null ? String(max) : '',
  };
}

/** Required-field checks, keyed by element id. Empty object when the section is complete. */
export function validateLifeFit(v: LifeFitValue): Partial<Record<LifeFitId, string>> {
  const e: Partial<Record<LifeFitId, string>> = {};
  if (!v.lifeStage) e.lifestage = 'Choose your life stage.';
  if (v.cityId === null) e.city = 'Pick your city from the list.';
  if (v.languages.length === 0) e.languages = 'Pick at least one language.';
  if (!v.traditionId) e.tradition = 'Choose your church tradition.';
  if (!v.faithStage) e.faith = 'Choose where you are in your faith.';
  if (!v.gender) e.gender = 'Choose an option.';
  const min = Number(v.ageMin);
  const max = Number(v.ageMax);
  const okAge = (s: string, n: number) => s.trim() !== '' && Number.isInteger(n) && n >= 18 && n <= 99;
  if (!okAge(v.ageMin, min)) e.agemin = 'Enter a whole number from 18 to 99.';
  if (!okAge(v.ageMax, max)) e.agemax = 'Enter a whole number from 18 to 99.';
  else if (!e.agemin && max < min) e.agemax = 'Maximum age can’t be below the minimum.';
  return e;
}

/** Request body keys for the Life fit section (send-what-you-change keys of /api/onboarding). */
export function lifeFitBody(v: LifeFitValue) {
  return {
    cityId: v.cityId,
    meetMode: v.meetMode,
    maxDistanceKm: v.maxDistanceKm,
    lifeStage: v.lifeStage,
    availability: v.availability,
    languages: v.languages,
    traditionId: v.traditionId,
    onlyMyTradition: v.onlyMyTradition,
    faithStage: v.faithStage,
    gender: v.gender,
    ageMin: Number(v.ageMin),
    ageMax: Number(v.ageMax),
  };
}

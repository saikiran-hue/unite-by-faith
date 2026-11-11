import type { FaithStage, FellowshipMode, Level, LifeStage, MeetMode, PillarCategory, Slot } from '@/types/database';

export interface ProfileColumns {
  full_name: string;
  headline: string;
  bio: string;
  avatar_url: string;
  denomination_or_tradition: string;
  church_or_fellowship: string;
  location_city: string;
  years_in_faith: string;
  fellowship_mode: FellowshipMode;
  languages: string[];
  location_city_id: number;
  meet_mode: MeetMode;
  life_stage: LifeStage;
  availability: Slot[];
  tradition_id: string;
  faith_stage: FaithStage;
  onboarding_completed: boolean;
}

export interface PrivateColumns {
  gender: 'man' | 'woman';
  age_min: number;
  age_max: number;
  max_distance_km: 10 | 25 | 50 | 100;
  only_my_tradition: boolean;
}

export interface TagInput {
  slug: string;
  category: PillarCategory;
  level: Level;
  isPriority: boolean;
}

export type ProfileUpdate = {
  profile: Partial<ProfileColumns>;
  private: Partial<PrivateColumns>;
  tags?: TagInput[];
};
export type ProfileUpdateError = { error: { field: string; message: string } };

const FELLOWSHIP: readonly string[] = ['both', 'group_only', 'duo_only'];
const MEET: readonly string[] = ['in_person', 'online', 'both'];
const LIFE: readonly string[] = [
  'student',
  'early_career',
  'established_career',
  'married_no_kids',
  'parent_young_kids',
  'parent_older_kids',
];
const STAGE: readonly string[] = ['exploring', 'new_believer', 'growing', 'mature'];
const SLOTS: readonly string[] = [
  'weekday_morning',
  'weekday_afternoon',
  'weekday_evening',
  'weekend_morning',
  'weekend_afternoon',
  'weekend_evening',
];
const CATEGORIES: readonly string[] = ['faith', 'skills', 'hobbies', 'tastes'];
const DISTANCES: readonly number[] = [10, 25, 50, 100];
const MAX_TAGS = 30;
const MAX_STARRED = 3;
const MAX_LANGUAGES = 6;

// [column, max length, error message when empty (null = may be empty)]
const STRING_RULES: Record<string, [number, string | null]> = {
  fullName: [80, 'Enter your name.'],
  headline: [120, 'Add a short headline.'],
  bio: [600, null],
  avatarUrl: [500, 'Choose a photo.'],
  denomination: [120, null],
  church: [120, null],
  locationCity: [120, null],
  yearsInFaith: [120, null],
  traditionId: [120, null],
};

const STRING_KEYS = {
  fullName: 'full_name',
  headline: 'headline',
  bio: 'bio',
  avatarUrl: 'avatar_url',
  denomination: 'denomination_or_tradition',
  church: 'church_or_fellowship',
  locationCity: 'location_city',
  yearsInFaith: 'years_in_faith',
  traditionId: 'tradition_id',
} as const;

const ENUM_KEYS = {
  fellowshipMode: ['fellowship_mode', FELLOWSHIP],
  meetMode: ['meet_mode', MEET],
  lifeStage: ['life_stage', LIFE],
  faithStage: ['faith_stage', STAGE],
} as const;

const bad = (field: string, message: string): ProfileUpdateError => ({ error: { field, message } });

function parseTags(raw: unknown, legacy: boolean): TagInput[] | ProfileUpdateError {
  const field = 'tags';
  if (!Array.isArray(raw)) return bad(field, 'Tags must be a list.');
  if (raw.length > MAX_TAGS) return bad(field, `Pick at most ${MAX_TAGS} tags.`);
  const seen = new Set<string>();
  const out: TagInput[] = [];
  let starred = 0;
  for (const t of raw) {
    if (typeof t !== 'object' || t === null) return bad(field, 'Each tag must be an object.');
    const r = t as Record<string, unknown>;
    if (typeof r.slug !== 'string' || !r.slug) return bad(field, 'Each tag needs a slug.');
    if (typeof r.category !== 'string' || !CATEGORIES.includes(r.category)) {
      return bad(field, 'Each tag needs a valid category.');
    }
    if (r.isPriority !== undefined && typeof r.isPriority !== 'boolean') {
      return bad(field, 'isPriority must be true or false.');
    }
    const level = legacy ? 2 : r.level;
    if (level !== 1 && level !== 2 && level !== 3) return bad(field, 'Level must be 1, 2 or 3.');
    if (seen.has(r.slug)) return bad(field, 'Each tag can only be listed once.');
    seen.add(r.slug);
    const isPriority = r.isPriority === true;
    if (isPriority) starred++;
    out.push({ slug: r.slug, category: r.category as PillarCategory, level, isPriority });
  }
  if (starred > MAX_STARRED) return bad(field, `Star at most ${MAX_STARRED} tags.`);
  return out;
}

/** Maps a request body to column updates. Only keys present in the body are included. */
export function buildProfileUpdate(body: unknown): ProfileUpdate | ProfileUpdateError {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return bad('body', 'Send a JSON object.');
  }
  const b = body as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const profile: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};

  if (has('birthDate')) return bad('birthDate', "Date of birth can't be changed here.");

  for (const [key, col] of Object.entries(STRING_KEYS)) {
    if (!has(key)) continue;
    if (typeof b[key] !== 'string') return bad(key, 'Must be text.');
    const v = (b[key] as string).trim();
    const [max, emptyMsg] = STRING_RULES[key];
    if (!v && emptyMsg) return bad(key, emptyMsg);
    if (v.length > max) return bad(key, `Keep this to ${max} characters or fewer.`);
    profile[col] = v;
  }
  for (const [key, [col, allowed]] of Object.entries(ENUM_KEYS)) {
    if (!has(key)) continue;
    if (typeof b[key] !== 'string' || !allowed.includes(b[key])) return bad(key, 'Not a valid option.');
    profile[col] = b[key];
  }
  if (has('languages')) {
    const l = b.languages;
    if (
      !Array.isArray(l) ||
      l.length === 0 ||
      l.length > MAX_LANGUAGES ||
      !l.every((x) => typeof x === 'string' && /^[a-z]{2}$/.test(x))
    ) {
      return bad('languages', `Pick 1 to ${MAX_LANGUAGES} languages.`);
    }
    profile.languages = [...new Set(l as string[])];
  }
  if (has('cityId')) {
    if (typeof b.cityId !== 'number' || !Number.isInteger(b.cityId) || b.cityId <= 0) {
      return bad('cityId', 'Must be a positive whole number.');
    }
    profile.location_city_id = b.cityId;
  }
  if (has('availability')) {
    const a = b.availability;
    if (!Array.isArray(a) || !a.every((x) => typeof x === 'string' && SLOTS.includes(x))) {
      return bad('availability', 'Not a valid set of times.');
    }
    profile.availability = [...new Set(a as string[])];
  }
  if (has('onboardingCompleted')) {
    if (typeof b.onboardingCompleted !== 'boolean') return bad('onboardingCompleted', 'Must be true or false.');
    profile.onboarding_completed = b.onboardingCompleted;
  }

  if (has('gender')) {
    if (b.gender !== 'man' && b.gender !== 'woman') return bad('gender', 'Not a valid option.');
    priv.gender = b.gender;
  }
  if (has('ageMin')) {
    if (typeof b.ageMin !== 'number' || !Number.isInteger(b.ageMin) || b.ageMin < 18 || b.ageMin > 99) {
      return bad('ageMin', 'Minimum age must be a whole number from 18 to 99.');
    }
    priv.age_min = b.ageMin;
  }
  if (has('ageMax')) {
    if (typeof b.ageMax !== 'number' || !Number.isInteger(b.ageMax) || b.ageMax < 18 || b.ageMax > 99) {
      return bad('ageMax', 'Maximum age must be a whole number from 18 to 99.');
    }
    priv.age_max = b.ageMax;
  }
  if (typeof priv.age_min === 'number' && typeof priv.age_max === 'number' && priv.age_max < priv.age_min) {
    return bad('ageMax', 'Maximum age can’t be below the minimum.');
  }
  if (has('maxDistanceKm')) {
    if (typeof b.maxDistanceKm !== 'number' || !DISTANCES.includes(b.maxDistanceKm)) {
      return bad('maxDistanceKm', 'Must be 10, 25, 50 or 100.');
    }
    priv.max_distance_km = b.maxDistanceKm;
  }
  if (has('onlyMyTradition')) {
    if (typeof b.onlyMyTradition !== 'boolean') return bad('onlyMyTradition', 'Must be true or false.');
    priv.only_my_tradition = b.onlyMyTradition;
  }

  const result: ProfileUpdate = { profile: profile as Partial<ProfileColumns>, private: priv as Partial<PrivateColumns> };
  const tagKey = has('tags') ? 'tags' : has('selectedTags') ? 'selectedTags' : null;
  if (tagKey) {
    const tags = parseTags(b[tagKey], tagKey === 'selectedTags');
    if ('error' in tags) return tags;
    result.tags = tags;
  }
  return result;
}

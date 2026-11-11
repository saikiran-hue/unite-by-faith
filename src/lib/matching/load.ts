import type { SupabaseClient } from '@supabase/supabase-js';
import { ageOn } from '@/lib/age';
import type { FaithStage, LifeStage, MeetMode, PillarCategory, Slot } from '@/types/database';
import { lifeFitMissing } from './rank';
import type { MatchPerson, MatchWeights, ScoreContext, TagPick } from './score';

/** Public, allow-listed fields of a person (spec section 9). No age, gender, birth date or distance rules. */
export interface PublicPerson {
  id: string;
  full_name: string;
  display_handle: string;
  avatar_url: string;
  headline: string;
  denomination_or_tradition: string;
  city: string | null;
  tradition: { id: string; name: string } | null;
  faith_stage: FaithStage | null;
  life_stage: LifeStage | null;
  availability: Slot[];
  languages: string[];
  tags: { slug: string; category: PillarCategory; level: number; priority: boolean }[];
}

export interface LoadedPerson {
  match: MatchPerson;
  pub: PublicPerson;
}

interface ProfileRow {
  id: string;
  full_name: string;
  display_handle: string;
  avatar_url: string;
  headline: string;
  denomination_or_tradition: string;
  languages: string[] | null;
  location_city_id: number | null;
  meet_mode: MeetMode;
  life_stage: LifeStage | null;
  availability: Slot[] | null;
  tradition_id: string | null;
  faith_stage: FaithStage | null;
  is_demo_account: boolean;
}
interface PrivateRow {
  user_id: string;
  birth_date: string | null;
  gender: string | null;
  max_distance_km: number | null;
}
interface CityRow {
  id: number;
  name: string;
  lat: number;
  lng: number;
  timezone: string;
}
interface TraditionRow {
  id: string;
  name: string;
  family: string;
}
interface UserTagRow {
  user_id: string;
  tag_slug: string;
  category: PillarCategory;
  level: number;
  is_priority: boolean;
}

/** Minutes east of UTC for an IANA timezone right now (for example Asia/Kolkata is 330). */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = part ? /GMT([+-])(\d{2}):?(\d{2})?/.exec(part) : null;
    if (!m) return 0; // plain "GMT" is UTC
    const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return m[1] === '-' ? -mins : mins;
  } catch {
    return 0;
  }
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** Loads people by id. People missing any required Life-fit field are left out (the filters already fail closed). */
export async function loadPeople(admin: SupabaseClient, ids: string[]): Promise<Map<string, LoadedPerson>> {
  const out = new Map<string, LoadedPerson>();
  if (ids.length === 0) return out;

  const [profRes, privRes, tagRes] = await Promise.all([
    admin
      .from('profiles')
      .select(
        'id, full_name, display_handle, avatar_url, headline, denomination_or_tradition, languages, location_city_id, meet_mode, life_stage, availability, tradition_id, faith_stage, is_demo_account',
      )
      .in('id', ids),
    admin.from('profile_private').select('user_id, birth_date, gender, max_distance_km').in('user_id', ids),
    admin.from('user_tags').select('user_id, tag_slug, category, level, is_priority').in('user_id', ids),
  ]);
  const profiles = must<ProfileRow[]>(profRes as never, 'profiles');
  const privates = new Map(must<PrivateRow[]>(privRes as never, 'profile_private').map((r) => [r.user_id, r]));
  const tagRows = must<UserTagRow[]>(tagRes as never, 'user_tags');

  const cityIds = [...new Set(profiles.map((p) => p.location_city_id).filter((x): x is number => x !== null))];
  const tradIds = [...new Set(profiles.map((p) => p.tradition_id).filter((x): x is string => x !== null))];
  const [cityRes, tradRes] = await Promise.all([
    cityIds.length ? admin.from('cities').select('id, name, lat, lng, timezone').in('id', cityIds) : { data: [], error: null },
    tradIds.length ? admin.from('traditions').select('id, name, family').in('id', tradIds) : { data: [], error: null },
  ]);
  const cities = new Map(must<CityRow[]>(cityRes as never, 'cities').map((c) => [c.id, c]));
  const traditions = new Map(must<TraditionRow[]>(tradRes as never, 'traditions').map((t) => [t.id, t]));

  const tagsByUser = new Map<string, UserTagRow[]>();
  for (const t of tagRows) {
    const list = tagsByUser.get(t.user_id) ?? [];
    list.push(t);
    tagsByUser.set(t.user_id, list);
  }

  const today = new Date();
  for (const p of profiles) {
    const priv = privates.get(p.id);
    const city = p.location_city_id !== null ? cities.get(p.location_city_id) : undefined;
    const languages = p.languages ?? [];
    const missing = lifeFitMissing({
      birthDate: priv?.birth_date,
      gender: priv?.gender,
      languages,
      cityId: city ? city.id : null,
      lifeStage: p.life_stage,
      faithStage: p.faith_stage,
      traditionId: p.tradition_id,
    });
    if (!priv || !priv.birth_date || !city || missing.length > 0) continue;

    const trad = p.tradition_id ? traditions.get(p.tradition_id) : undefined;
    const rows = tagsByUser.get(p.id) ?? [];
    const tags: TagPick[] = rows.map((t) => ({
      slug: t.tag_slug,
      category: t.category,
      level: t.level as TagPick['level'],
      starred: t.is_priority,
    }));
    out.set(p.id, {
      match: {
        id: p.id,
        isDemo: p.is_demo_account,
        tags,
        traditionId: p.tradition_id,
        traditionFamily: trad?.family ?? null,
        faithStage: p.faith_stage,
        lifeStage: p.life_stage,
        availability: p.availability ?? [],
        age: ageOn(priv.birth_date, today),
        cityId: city.id,
        cityName: city.name,
        lat: city.lat,
        lng: city.lng,
        tzOffsetMin: tzOffsetMinutes(city.timezone, today),
        meetMode: p.meet_mode,
        maxDistanceKm: priv.max_distance_km ?? 25,
      },
      // Explicit allow-list: never spread the rows above.
      pub: {
        id: p.id,
        full_name: p.full_name,
        display_handle: p.display_handle,
        avatar_url: p.avatar_url,
        headline: p.headline,
        denomination_or_tradition: p.denomination_or_tradition,
        city: city.name,
        tradition: trad ? { id: trad.id, name: trad.name } : null,
        faith_stage: p.faith_stage,
        life_stage: p.life_stage,
        availability: p.availability ?? [],
        languages,
        tags: rows.map((t) => ({ slug: t.tag_slug, category: t.category, level: t.level, priority: t.is_priority })),
      },
    });
  }
  return out;
}

/** The viewer's raw required fields, for the 409 check. */
export async function loadViewerLifeFit(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [profRes, privRes] = await Promise.all([
    admin
      .from('profiles')
      .select('languages, location_city_id, life_stage, faith_stage, tradition_id')
      .eq('id', userId)
      .maybeSingle(),
    admin.from('profile_private').select('birth_date, gender').eq('user_id', userId).maybeSingle(),
  ]);
  if (profRes.error) throw new Error(`profiles: ${profRes.error.message}`);
  if (privRes.error) throw new Error(`profile_private: ${privRes.error.message}`);
  const p = profRes.data as Pick<ProfileRow, 'languages' | 'location_city_id' | 'life_stage' | 'faith_stage' | 'tradition_id'> | null;
  const priv = privRes.data as Pick<PrivateRow, 'birth_date' | 'gender'> | null;
  return lifeFitMissing({
    birthDate: priv?.birth_date,
    gender: priv?.gender,
    languages: p?.languages ?? [],
    cityId: p?.location_city_id ?? null,
    lifeStage: p?.life_stage ?? null,
    faithStage: p?.faith_stage ?? null,
    traditionId: p?.tradition_id ?? null,
  });
}

/** Active weights, tag popularity, labels, same-category neighbours and active-user count for the slugs in play. */
export async function loadScoreContext(
  admin: SupabaseClient,
  slugs: string[],
  isDemo: boolean,
): Promise<{ ctx: ScoreContext; labels: Map<string, string> }> {
  const unique = [...new Set(slugs)];
  const [wRes, popRes, nbRes, usersRes] = await Promise.all([
    admin.from('match_weights').select('config').eq('is_active', true).order('version', { ascending: false }).limit(1),
    unique.length
      ? admin.from('taxonomy_tags').select('slug, label, popularity').in('slug', unique)
      : { data: [], error: null },
    unique.length
      ? admin.from('tag_neighbors').select('tag_a, tag_b, sim').in('tag_a', unique)
      : { data: [], error: null },
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('onboarding_completed', true)
      .eq('is_demo_account', isDemo),
  ]);
  const weights = must<{ config: MatchWeights }[]>(wRes as never, 'match_weights')[0]?.config;
  if (!weights) throw new Error('No active match_weights row');
  if (usersRes.error) throw new Error(`profiles count: ${usersRes.error.message}`);

  const popularity = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const r of must<{ slug: string; label: string; popularity: number }[]>(popRes as never, 'taxonomy_tags')) {
    popularity.set(r.slug, r.popularity);
    labels.set(r.slug, r.label);
  }
  const neighbors = new Map<string, Map<string, number>>();
  for (const r of must<{ tag_a: string; tag_b: string; sim: number }[]>(nbRes as never, 'tag_neighbors')) {
    const m = neighbors.get(r.tag_a) ?? new Map<string, number>();
    m.set(r.tag_b, r.sim);
    neighbors.set(r.tag_a, m);
  }
  return {
    ctx: { neighbors, popularity, activeUsers: Math.max(1, usersRes.count ?? 1), weights },
    labels,
  };
}

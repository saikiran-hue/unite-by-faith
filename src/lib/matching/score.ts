import type { FaithStage, LifeStage, Level, MeetMode, PillarCategory, Slot } from '@/types/database';

export interface TagPick {
  slug: string;
  category: PillarCategory;
  level: Level;
  starred: boolean;
}
export interface MatchPerson {
  id: string;
  isDemo: boolean;
  tags: TagPick[];
  traditionId: string | null;
  traditionFamily: string | null;
  faithStage: FaithStage | null;
  lifeStage: LifeStage | null;
  availability: Slot[];
  age: number;
  cityId: number;
  cityName: string;
  lat: number;
  lng: number;
  tzOffsetMin: number;
  meetMode: MeetMode;
  maxDistanceKm: number;
}
export interface MatchWeights {
  version: number;
  total: { faith: number; interests: number; life: number };
  faith: { tags: number; tradition: number; stage: number };
  interests: { hobbies: number; tastes: number; skills: number };
  life: { stage: number; availability: number; place: number; age: number };
  pod: { min: number; mean: number; anchor: number };
  neighborMin: number;
  relatedCap: number;
  onlineTzMaxMin: number;
}
export interface ScoreContext {
  neighbors: Map<string, Map<string, number>>;
  popularity: Map<string, number>;
  activeUsers: number;
  weights: MatchWeights;
}
export type Reason =
  | { kind: 'shared_tag'; slug: string }
  | { kind: 'related_tag'; mine: string; theirs: string }
  | { kind: 'tradition'; same: boolean; family: string }
  | { kind: 'life'; detail: 'same_stage' | 'availability' | 'same_city' | 'distance'; value?: string };
export interface PairScore {
  score: number;
  breakdown: { faith: number; interests: number; lifeFit: number };
  reasons: Reason[];
  weightsVersion: number;
}

const MAX_REASONS = 4;
const FAITH_STAGES: FaithStage[] = ['exploring', 'new_believer', 'growing', 'mature'];
const LIFE_STAGES: LifeStage[] = [
  'student',
  'early_career',
  'established_career',
  'married_no_kids',
  'parent_young_kids',
  'parent_older_kids',
];

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Weighted mean that drops null values and renormalises; null when nothing is left. */
function wmean(parts: [number, number | null][]): number | null {
  let sw = 0;
  let sv = 0;
  for (const [w, v] of parts) {
    if (v === null) continue;
    sw += w;
    sv += w * v;
  }
  return sw > 0 ? sv / sw : null;
}

export function tagSimilarity(a: string, b: string, ctx: ScoreContext): number {
  if (a === b) return 1;
  const sim = ctx.neighbors.get(a)?.get(b);
  const { neighborMin, relatedCap } = ctx.weights;
  if (sim === undefined || !Number.isFinite(sim) || sim < neighborMin) return 0;
  return clamp01(((sim - neighborMin) / (1 - neighborMin)) * relatedCap);
}

function tagWeight(t: TagPick, ctx: ScoreContext): number {
  const pop = Math.max(0, ctx.popularity.get(t.slug) ?? 0);
  const n = Math.max(1, ctx.activeUsers);
  const idf = Math.log(1 + n / (1 + pop));
  return t.level * (t.starred ? 1.5 : 1) * idf;
}

/** Directed coverage C(A->B), plus the best match per tag of A. */
function coverage(A: TagPick[], B: TagPick[], ctx: ScoreContext) {
  let num = 0;
  let den = 0;
  const best: { a: TagPick; b: TagPick | null; s: number; w: number }[] = [];
  for (const a of A) {
    const w = tagWeight(a, ctx);
    let s = 0;
    let bb: TagPick | null = null;
    for (const b of B) {
      const v = tagSimilarity(a.slug, b.slug, ctx);
      if (v > s) {
        s = v;
        bb = b;
      }
    }
    num += w * s;
    den += w;
    best.push({ a, b: bb, s, w });
  }
  return { value: den > 0 ? num / den : 0, best };
}

export function interestSimilarity(A: TagPick[], B: TagPick[], ctx: ScoreContext): number | null {
  if (A.length === 0 || B.length === 0) return null;
  return clamp01((coverage(A, B, ctx).value + coverage(B, A, ctx).value) / 2);
}

function haversineKm(a: MatchPerson, b: MatchPerson): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function traditionScore(a: MatchPerson, b: MatchPerson): number | null {
  if (a.traditionId === null || b.traditionId === null) return null;
  if (a.traditionId === b.traditionId) return 1;
  if (a.traditionFamily !== null && a.traditionFamily === b.traditionFamily) return 0.6;
  return 0.2;
}

function stageCloseness(a: FaithStage | null, b: FaithStage | null): number | null {
  if (a === null || b === null) return null;
  return clamp01(1 - Math.abs(FAITH_STAGES.indexOf(a) - FAITH_STAGES.indexOf(b)) / 3);
}

function lifeStageScore(a: LifeStage | null, b: LifeStage | null): number | null {
  if (a === null || b === null) return null;
  const d = Math.abs(LIFE_STAGES.indexOf(a) - LIFE_STAGES.indexOf(b));
  return d === 0 ? 1 : d === 1 ? 0.6 : 0.3;
}

function sharedSlots(a: Slot[], b: Slot[]): Slot[] {
  const sb = new Set(b);
  return [...new Set(a)].filter((s) => sb.has(s));
}

function availabilityScore(a: Slot[], b: Slot[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;
  const inter = sharedSlots(a, b).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? inter / union : 0.5;
}

interface Place {
  score: number;
  inPerson: boolean;
  km: number;
}

function placeScore(a: MatchPerson, b: MatchPerson, ctx: ScoreContext): Place {
  const km = haversineKm(a, b);
  const limit = Math.min(a.maxDistanceKm, b.maxDistanceKm);
  const inPersonOk = a.meetMode !== 'online' && b.meetMode !== 'online';
  const within = km <= limit + 1e-6;
  if (a.cityId === b.cityId) return { score: 1, inPerson: inPersonOk, km };
  if (inPersonOk && within) {
    return { score: limit > 0 ? clamp01(1 - km / limit) : 0, inPerson: true, km };
  }
  const gap = Math.abs(a.tzOffsetMin - b.tzOffsetMin);
  return { score: clamp01(1 - gap / ctx.weights.onlineTzMaxMin), inPerson: false, km };
}

function ageScore(a: number, b: number): number {
  return clamp01(1 - Math.abs(a - b) / 10);
}

const byCategory = (picks: TagPick[], c: PillarCategory) => picks.filter((p) => p.category === c);

function buildReasons(a: MatchPerson, b: MatchPerson, T: number | null, place: Place, ctx: ScoreContext): Reason[] {
  const shared: { slug: string; weight: number; faith: boolean }[] = [];
  const bBySlug = new Map(b.tags.map((t) => [t.slug, t]));
  for (const t of a.tags) {
    const o = bBySlug.get(t.slug);
    if (o) shared.push({ slug: t.slug, weight: tagWeight(t, ctx) + tagWeight(o, ctx), faith: t.category === 'faith' });
  }
  shared.sort((x, y) => y.weight - x.weight || Number(y.faith) - Number(x.faith));

  const sharedSlugs = new Set(shared.map((s) => s.slug));
  const related = new Map<string, { mine: string; theirs: string; weight: number; faith: boolean }>();
  const consider = (mine: TagPick, theirs: TagPick, weight: number) => {
    const key = `${mine.slug}|${theirs.slug}`;
    const prev = related.get(key);
    if (!prev || prev.weight < weight) {
      related.set(key, { mine: mine.slug, theirs: theirs.slug, weight, faith: mine.category === 'faith' });
    }
  };
  for (const r of coverage(a.tags, b.tags, ctx).best) {
    if (r.b && r.s > 0 && r.s < 1 && !sharedSlugs.has(r.a.slug)) consider(r.a, r.b, r.w * r.s);
  }
  for (const r of coverage(b.tags, a.tags, ctx).best) {
    if (r.b && r.s > 0 && r.s < 1 && !sharedSlugs.has(r.a.slug)) consider(r.b, r.a, r.w * r.s);
  }
  const relatedList = [...related.values()].sort((x, y) => y.weight - x.weight || Number(y.faith) - Number(x.faith));

  const reasons: Reason[] = [];
  for (const s of shared) reasons.push({ kind: 'shared_tag', slug: s.slug });
  for (const r of relatedList) reasons.push({ kind: 'related_tag', mine: r.mine, theirs: r.theirs });
  if (T !== null && T >= 0.6) {
    reasons.push({ kind: 'tradition', same: T === 1, family: a.traditionFamily ?? b.traditionFamily ?? '' });
  }
  if (a.lifeStage !== null && a.lifeStage === b.lifeStage) {
    reasons.push({ kind: 'life', detail: 'same_stage', value: a.lifeStage });
  }
  const slots = sharedSlots(a.availability, b.availability);
  if (slots.length > 0) reasons.push({ kind: 'life', detail: 'availability', value: slots.join(',') });
  if (a.cityId === b.cityId) {
    reasons.push({ kind: 'life', detail: 'same_city', value: a.cityName });
  } else if (place.inPerson) {
    reasons.push({ kind: 'life', detail: 'distance', value: String(Math.round(place.km)) });
  }
  return reasons.slice(0, MAX_REASONS);
}

export function scorePair(a: MatchPerson, b: MatchPerson, ctx: ScoreContext): PairScore {
  const w = ctx.weights;
  const T = traditionScore(a, b);
  const faith = wmean([
    [w.faith.tags, interestSimilarity(byCategory(a.tags, 'faith'), byCategory(b.tags, 'faith'), ctx)],
    [w.faith.tradition, T],
    [w.faith.stage, stageCloseness(a.faithStage, b.faithStage)],
  ]) ?? 0;
  const interests = wmean([
    [w.interests.hobbies, interestSimilarity(byCategory(a.tags, 'hobbies'), byCategory(b.tags, 'hobbies'), ctx)],
    [w.interests.tastes, interestSimilarity(byCategory(a.tags, 'tastes'), byCategory(b.tags, 'tastes'), ctx)],
    [w.interests.skills, interestSimilarity(byCategory(a.tags, 'skills'), byCategory(b.tags, 'skills'), ctx)],
  ]) ?? 0;
  const place = placeScore(a, b, ctx);
  const life = wmean([
    [w.life.stage, lifeStageScore(a.lifeStage, b.lifeStage)],
    [w.life.availability, availabilityScore(a.availability, b.availability)],
    [w.life.place, place.score],
    [w.life.age, ageScore(a.age, b.age)],
  ]) ?? 0;

  const total = w.total.faith * faith + w.total.interests * interests + w.total.life * life;
  return {
    score: Math.round(100 * total),
    breakdown: {
      faith: Math.round(100 * faith),
      interests: Math.round(100 * interests),
      lifeFit: Math.round(100 * life),
    },
    reasons: buildReasons(a, b, T, place, ctx),
    weightsVersion: w.version,
  };
}

/** Inputs and result are 0-1. */
export function combinePod(scores: number[], anchor: number, w: MatchWeights['pod']): number {
  if (scores.length === 0) return w.anchor * anchor;
  const min = Math.min(...scores);
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  return w.min * min + w.mean * mean + w.anchor * anchor;
}

export function scorePod(viewer: MatchPerson, members: MatchPerson[], anchorTags: string[], ctx: ScoreContext): PairScore {
  if (members.length === 0) throw new Error('scorePod needs at least one member');
  const pairs = members.map((m) => scorePair(viewer, m, ctx));
  const best = pairs.reduce((x, y) => (y.score > x.score ? y : x));
  const picks: TagPick[] = anchorTags.map((slug) => ({ slug, category: 'hobbies', level: 2, starred: false }));
  const anchor = interestSimilarity(viewer.tags, picks, ctx) ?? 0;
  const total = combinePod(pairs.map((p) => p.score / 100), anchor, ctx.weights.pod);
  return { ...best, score: Math.round(100 * total) };
}

import { scorePair, scorePod, type MatchPerson, type PairScore, type ScoreContext } from './score';

export interface LifeFitInput {
  birthDate?: string | null;
  gender?: string | null;
  languages: string[];
  cityId: number | null;
  lifeStage: string | null;
  faithStage: string | null;
  traditionId: string | null;
}

/** Names of the required Life-fit fields that are still empty. */
export function lifeFitMissing(p: LifeFitInput): string[] {
  const missing: string[] = [];
  if (!p.birthDate) missing.push('birthDate');
  if (!p.gender) missing.push('gender');
  if (p.languages.length === 0) missing.push('languages');
  if (p.cityId === null) missing.push('city');
  if (!p.lifeStage) missing.push('lifeStage');
  if (!p.faithStage) missing.push('faithStage');
  if (!p.traditionId) missing.push('tradition');
  return missing;
}

const byScoreThenId = <T extends PairScore>(idOf: (x: T) => string) => (a: T, b: T) =>
  b.score - a.score || (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0);

export function rankDuos(
  viewer: MatchPerson,
  candidates: MatchPerson[],
  ctx: ScoreContext,
  limit = 20,
): Array<PairScore & { userId: string }> {
  return candidates
    .map((c) => ({ ...scorePair(viewer, c, ctx), userId: c.id }))
    .sort(byScoreThenId((x) => x.userId))
    .slice(0, limit);
}

export function rankPods(
  viewer: MatchPerson,
  pods: { podId: string; members: MatchPerson[]; anchorTags: string[] }[],
  ctx: ScoreContext,
  limit = 20,
): Array<PairScore & { podId: string }> {
  return pods
    .filter((p) => p.members.length > 0)
    .map((p) => ({ ...scorePod(viewer, p.members, p.anchorTags, ctx), podId: p.podId }))
    .sort(byScoreThenId((x) => x.podId))
    .slice(0, limit);
}

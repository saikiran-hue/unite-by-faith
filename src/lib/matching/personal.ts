import { embed } from './embed';
import { normaliseQuery } from './suggest';

/**
 * Raw gte-small cosine floor for two personal topics to count as shared (task-E report).
 * Same-topic pairs scored 0.866-0.987 (WW2 history / World War 2 .933, English classes / Learning English .901);
 * clear non-matches up to 0.887. Sibling topics (World War 1 / World War 2 .919) pass, so their reason names both.
 */
export const PERSONAL_MATCH_MIN = 0.89;
/** At or above this a shared topic reads "You both follow <mine>"; below it, "Your <mine>, their <theirs>". */
export const PERSONAL_SAME_MIN = 0.93;
/** Shared topics counted per pair. */
export const MAX_SHARED_TOPICS = 3;
/** Added to the 0-1 Interests part per shared topic (capped at MAX_SHARED_TOPICS, Interests clamped to 1). */
export const PERSONAL_TOPIC_BONUS = 0.05;
/** Other (not shared) topics shown on a match card after the shared ones. */
const CARD_OTHERS = 2;

export interface PersonalTopic {
  label: string;
  vec: Float32Array | null;
}
export interface SharedTopic {
  mine: string;
  theirs: string;
  same: boolean;
}

/** How a label is embedded and compared: the suggest normalisation (trimmed, single spaces, lowercase). */
export const topicKey = (label: string) => normaliseQuery(label) ?? label.trim().toLowerCase();

function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length && i < b.length; i++) d += a[i] * b[i];
  return d; // both are L2-normalised
}

/**
 * Topics A and B share, best first: each topic is used at most once, at most MAX_SHARED_TOPICS.
 * Equal labels count even without embeddings; otherwise cosine must reach PERSONAL_MATCH_MIN.
 */
export function sharedTopics(A: PersonalTopic[] = [], B: PersonalTopic[] = [], min = PERSONAL_MATCH_MIN): SharedTopic[] {
  const pairs: { i: number; j: number; cos: number }[] = [];
  A.forEach((a, i) =>
    B.forEach((b, j) => {
      const cos = topicKey(a.label) === topicKey(b.label) ? 1 : a.vec && b.vec ? cosine(a.vec, b.vec) : 0;
      if (cos >= min) pairs.push({ i, j, cos });
    }),
  );
  pairs.sort((x, y) => y.cos - x.cos || x.i - y.i || x.j - y.j);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const out: SharedTopic[] = [];
  for (const p of pairs) {
    if (out.length >= MAX_SHARED_TOPICS) break;
    if (usedA.has(p.i) || usedB.has(p.j)) continue;
    usedA.add(p.i);
    usedB.add(p.j);
    out.push({ mine: A[p.i].label, theirs: B[p.j].label, same: p.cos >= PERSONAL_SAME_MIN });
  }
  return out;
}

/** Interests (0-1) after the shared-topic bonus. Unchanged when nothing is shared. */
export function withTopicBonus(interests: number, shared: number): number {
  if (shared <= 0) return interests;
  return Math.min(1, interests + PERSONAL_TOPIC_BONUS * Math.min(shared, MAX_SHARED_TOPICS));
}

/** A member's topics for a match card: the shared ones first, then up to two others, in their order. */
export function cardTopics(theirs: string[], shared: SharedTopic[]): { label: string; shared: boolean }[] {
  const sharedSet = new Set(shared.map((s) => s.theirs));
  const first = theirs.filter((l) => sharedSet.has(l)).map((label) => ({ label, shared: true }));
  const rest = theirs.filter((l) => !sharedSet.has(l)).slice(0, CARD_OTHERS).map((label) => ({ label, shared: false }));
  return [...first, ...rest];
}

/** pgvector's text form '[0.1,0.2,...]' (what PostgREST returns) to a vector; null when missing or unreadable. */
export function parseVector(v: unknown): Float32Array | null {
  if (typeof v !== 'string') return null;
  try {
    const arr = JSON.parse(v) as unknown;
    return Array.isArray(arr) && arr.length > 0 && arr.every((x) => typeof x === 'number') ? Float32Array.from(arr) : null;
  } catch {
    return null;
  }
}

/** Which labels need embedding now: those without a stored embedding under the same key. */
export function topicsToEmbed(labels: string[], embedded: string[]): string[] {
  const have = new Set(embedded.map(topicKey));
  return labels.filter((l) => !have.has(topicKey(l)));
}

/**
 * Embeds labels in one batched call, as '[...]' strings for the replace RPC.
 * Never throws: on failure every label gets null, and the next save tries again.
 */
export async function embedTopics(labels: string[]): Promise<(string | null)[]> {
  if (labels.length === 0) return [];
  try {
    const vecs = await embed(labels.map(topicKey));
    return vecs.map((v) => `[${Array.from(v).join(',')}]`);
  } catch (e) {
    console.error('personal topic embedding failed; storing without embeddings', e);
    return labels.map(() => null);
  }
}

/**
 * Rows for replace_user_personal_topics: labels without a stored embedding are embedded now (one call);
 * the rest send null, which keeps the stored embedding. A failed embed also sends null and is retried next save.
 */
export async function topicRowsForSave(
  labels: string[],
  embedded: string[],
  embedFn: (labels: string[]) => Promise<(string | null)[]> = embedTopics,
): Promise<{ label: string; embedding: string | null }[]> {
  const fresh = topicsToEmbed(labels, embedded);
  const vecs = await embedFn(fresh);
  const vecOf = new Map(fresh.map((l, i) => [l, vecs[i] ?? null]));
  return labels.map((label) => ({ label, embedding: vecOf.get(label) ?? null }));
}

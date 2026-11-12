import { describe, expect, it, vi } from 'vitest';
import {
  cardTopics,
  MAX_SHARED_TOPICS,
  parseVector,
  PERSONAL_TOPIC_BONUS,
  sharedTopics,
  topicRowsForSave,
  topicsToEmbed,
  withTopicBonus,
  type PersonalTopic,
} from './personal';

/** A unit vector at `deg` degrees in the first two dimensions: cos between two of them is cos(difference). */
const at = (deg: number) => {
  const v = new Float32Array(384);
  v[0] = Math.cos((deg * Math.PI) / 180);
  v[1] = Math.sin((deg * Math.PI) / 180);
  return v;
};
const t = (label: string, deg: number | null): PersonalTopic => ({ label, vec: deg === null ? null : at(deg) });

describe('sharedTopics', () => {
  it('pairs topics at or above the floor, best first, using each once', () => {
    // cos(15deg) = .966, cos(25deg) = .906, cos(30deg) = .866
    const mine = [t('World War 2', 0), t('Learning English', 100)];
    const theirs = [t('WW2 History', 15), t('Second World War', 5), t('English Classes', 125), t('Gardening', 200)];
    expect(sharedTopics(mine, theirs)).toEqual([
      { mine: 'World War 2', theirs: 'Second World War', same: true },
      { mine: 'Learning English', theirs: 'English Classes', same: false },
    ]);
  });
  it('drops pairs below the floor', () => {
    expect(sharedTopics([t('Chess', 0)], [t('Checkers', 30)])).toEqual([]);
  });
  it('counts equal labels without embeddings', () => {
    expect(sharedTopics([t('World War 2', null)], [t(' world  war 2 ', null)])).toEqual([
      { mine: 'World War 2', theirs: ' world  war 2 ', same: true },
    ]);
  });
  it('is empty when either side has none, and caps at 3', () => {
    expect(sharedTopics(undefined, [t('a b', 0)])).toEqual([]);
    const many = ['Aa', 'Bb', 'Cc', 'Dd', 'Ee'].map((l, i) => t(l, i * 60));
    expect(sharedTopics(many, many)).toHaveLength(MAX_SHARED_TOPICS);
  });
});

describe('withTopicBonus', () => {
  it('is unchanged with nothing shared, adds per topic, caps and clamps', () => {
    expect(withTopicBonus(0.4, 0)).toBe(0.4);
    expect(withTopicBonus(0.4, 2)).toBeCloseTo(0.4 + 2 * PERSONAL_TOPIC_BONUS, 9);
    expect(withTopicBonus(0.4, 9)).toBeCloseTo(0.4 + 3 * PERSONAL_TOPIC_BONUS, 9);
    expect(withTopicBonus(0.99, 3)).toBe(1);
  });
});

describe('cardTopics', () => {
  it('lists shared first, then two others', () => {
    const shared = [{ mine: 'World War 2', theirs: 'WW2 History', same: true }];
    expect(cardTopics(['Baking', 'Chess', 'WW2 History', 'Opera'], shared)).toEqual([
      { label: 'WW2 History', shared: true },
      { label: 'Baking', shared: false },
      { label: 'Chess', shared: false },
    ]);
  });
});

describe('parseVector', () => {
  it('reads pgvector text and rejects anything else', () => {
    expect(Array.from(parseVector('[0.5,-0.25]')!)).toEqual([0.5, -0.25]);
    expect(parseVector(null)).toBeNull();
    expect(parseVector('nope')).toBeNull();
    expect(parseVector('[]')).toBeNull();
  });
});

describe('save rows', () => {
  it('embeds only labels with no stored embedding (ignoring case and spacing)', () => {
    expect(topicsToEmbed(['World War 2', 'Chess', 'Opera'], ['world war 2', 'Opera'])).toEqual(['Chess']);
  });
  it('sends new vectors and null for kept ones, in one embed call', async () => {
    const embedFn = vi.fn(async (labels: string[]) => labels.map((l) => `[${l.length}]`));
    const rows = await topicRowsForSave(['World War 2', 'Chess'], ['World War 2'], embedFn);
    expect(embedFn).toHaveBeenCalledTimes(1);
    expect(embedFn).toHaveBeenCalledWith(['Chess']);
    expect(rows).toEqual([
      { label: 'World War 2', embedding: null },
      { label: 'Chess', embedding: '[5]' },
    ]);
  });
  it('stores null when embedding fails, so the next save retries', async () => {
    const rows = await topicRowsForSave(['Chess'], [], async (l) => l.map(() => null));
    expect(rows).toEqual([{ label: 'Chess', embedding: null }]);
    // Next save: still not embedded, so it is embedded again.
    expect(topicsToEmbed(['Chess'], [])).toEqual(['Chess']);
  });
});

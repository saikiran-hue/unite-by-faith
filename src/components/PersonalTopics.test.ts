import { describe, expect, it } from 'vitest';
import { shouldSendTopics, topicProblem, topicsChanged } from './PersonalTopics';

describe('personal topics editor rules', () => {
  it('compares lists ignoring order and case', () => {
    expect(topicsChanged(['Chess', 'Opera'], ['opera', 'chess'])).toBe(false);
    expect(topicsChanged(['Chess'], ['Chess', 'Opera'])).toBe(true);
  });
  it('sends when changed or a kept topic has no embedding, never when not loaded', () => {
    const saved = [{ label: 'Chess', embedded: true }];
    expect(shouldSendTopics(['Chess'], saved, true)).toBe(false);
    expect(shouldSendTopics(['Chess', 'Opera'], saved, true)).toBe(true);
    expect(shouldSendTopics(['Chess'], [{ label: 'Chess', embedded: false }], true)).toBe(true);
    expect(shouldSendTopics([], saved, false)).toBe(false);
  });
  it('explains why a topic cannot be added', () => {
    expect(topicProblem('world war 2', [])).toBeNull();
    expect(topicProblem('a', [])).toMatch(/2 to 40 characters/);
    expect(topicProblem('​--​', [])).toMatch(/letter or number/);
    expect(topicProblem('chess', ['Chess'])).toBe('You already added “Chess”.');
    expect(topicProblem('Opera', Array.from({ length: 10 }, (_, i) => `T${i}x`))).toBe('You have 10. Remove one to add another.');
  });
});

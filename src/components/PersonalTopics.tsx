'use client';

import { useRef, useState } from 'react';
import type { PersonalTopicSaved } from '@/types/database';
import { Btn, Icon } from '@/components/ubf';
import { CUSTOM_MAX_CHARS, CUSTOM_MIN_CHARS, MAX_PERSONAL_TOPICS, topicLabel, validCustomLabel } from '@/lib/profile-update';

const key = (s: string) => s.toLowerCase();

/** True when the topic lists differ (order and case ignored). */
export function topicsChanged(a: string[], b: string[]): boolean {
  const sb = new Set(b.map(key));
  return a.length !== b.length || a.some((x) => !sb.has(key(x)));
}

/**
 * Whether a save should send personalTopics: when the list changed, or when a kept one has no embedding yet
 * (so the server can try again). Never when they failed to load, so a save can't clear them.
 */
export function shouldSendTopics(topics: string[], saved: PersonalTopicSaved[], loaded: boolean): boolean {
  if (!loaded) return false;
  const mine = new Set(topics.map(key));
  return topicsChanged(topics, saved.map((s) => s.label)) || saved.some((s) => !s.embedded && mine.has(key(s.label)));
}

/** Why a typed topic can't be added, or null when it can. */
export function topicProblem(raw: string, topics: string[]): string | null {
  if (topics.length >= MAX_PERSONAL_TOPICS) return `You have ${MAX_PERSONAL_TOPICS}. Remove one to add another.`;
  if (!validCustomLabel(raw)) return `Use ${CUSTOM_MIN_CHARS} to ${CUSTOM_MAX_CHARS} characters, with a letter or number.`;
  const label = topicLabel(raw);
  if (topics.some((t) => key(t) === key(label))) return `You already added “${label}”.`;
  return null;
}

interface PersonalTopicsProps {
  /** Prefix for element ids, unique on the page. */
  id: string;
  topics: string[];
  setTopics: (next: string[]) => void;
}

/** Free-text personal topics: an input with an Add button (Enter adds), removable chips and an "N of 10" counter. */
export function PersonalTopics({ id, topics, setTopics }: PersonalTopicsProps) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function add() {
    const p = topicProblem(text, topics);
    if (p) {
      setProblem(p);
      input.current?.focus();
      return;
    }
    setTopics([...topics, topicLabel(text)]);
    setText('');
    setProblem(null);
    input.current?.focus();
  }

  function remove(label: string) {
    setTopics(topics.filter((t) => t !== label));
    setProblem(null);
    // The chip's button goes away, so focus returns to the input.
    input.current?.focus();
  }

  return (
    <div className="ptopics">
      <div className="field">
        <label htmlFor={`${id}-in`}>Add a Personal Topic</label>
        <span className="hint" id={`${id}-hint`}>
          Your matches can see these.
        </span>
        <div className="pt-row">
          <input
            ref={input}
            className="input"
            id={`${id}-in`}
            value={text}
            maxLength={60}
            autoComplete="off"
            placeholder="e.g. World War 2"
            aria-invalid={problem ? true : undefined}
            aria-describedby={`${id}-hint ${id}-count${problem ? ` ${id}-err` : ''}`}
            onChange={(e) => {
              setText(e.target.value);
              if (problem) setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              add();
            }}
          />
          <Btn variant="btn-outline" icon="plus" onClick={add}>
            Add
          </Btn>
        </div>
        {problem && (
          <span className="hint" id={`${id}-err`} role="alert" style={{ color: 'var(--u-danger)' }}>
            {problem}
          </span>
        )}
        <span className="counter pt-count" id={`${id}-count`} role="status">
          {topics.length} of {MAX_PERSONAL_TOPICS}
        </span>
      </div>
      {topics.length > 0 && (
        <ul className="tchips pt-list" aria-label="Your personal topics">
          {topics.map((t) => (
            <li key={t} className="tchip own">
              <span className="t-main">{t}</span>
              <button type="button" className="t-x" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

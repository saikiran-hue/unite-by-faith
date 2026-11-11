'use client';

import { FellowshipPod, TaxonomyTag } from '@/types/database';
import { podCover } from '@/lib/sample-content';
import { AlertBox, Btn, HabitChips, Icon, ScorePill, reasonLine, sortHabits } from '@/components/ubf';

/** One 1v1 result from GET /api/match?kind=duo (Task 16 adds the breakdown and reasons to the card). */
export interface DuoResult {
  partner: {
    id: string;
    full_name: string;
    avatar_url: string;
    headline: string;
    denomination_or_tradition: string;
    city: string | null;
    tradition: { id: string; name: string } | null;
    tags: { slug: string }[];
  };
  existing_chat_room_id: string | null;
  score: number;
}

/** One group result from GET /api/match?kind=pods. */
export type PodResult = Omit<FellowshipPod, 'created_by' | 'members' | 'affinity_score' | 'overlapping_tags' | 'members'> & {
  members: { user_id: string; profile: { full_name: string; avatar_url: string } }[];
  score: number;
};

/* ------------------------------------------------------------------ */
/* 1v1 match tile                                                      */
/* ------------------------------------------------------------------ */

export function DuoCard({
  match,
  shared,
  tagMap,
  starred,
  busy,
  countUp,
  onConnect,
}: {
  match: DuoResult;
  /** Habit slugs both people have picked. */
  shared: string[];
  tagMap: Map<string, TaxonomyTag>;
  starred: Set<string>;
  busy: boolean;
  countUp?: boolean;
  onConnect: (match: DuoResult) => void;
}) {
  const p = match.partner;
  const first = p.full_name.split(' ')[0];
  const sharedSorted = sortHabits(shared, tagMap, starred);
  return (
    <li className="card mcard spot">
      <div className="m-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar" src={p.avatar_url} width={56} height={56} alt="" />
        <div className="grow">
          <h3 className="h3">{p.full_name}</h3>
          <p className="sub">{p.headline}</p>
          <p className="meta">
            <span>
              <Icon name="church" />
              {p.tradition?.name ?? p.denomination_or_tradition}
            </span>
            <span>
              <Icon name="pinmap" />
              {p.city}
            </span>
          </p>
        </div>
        <ScorePill pct={match.score} countUp={countUp} />
      </div>
      {shared.length > 0 && (
        <p className="reason">
          <span>{reasonLine(shared, tagMap)}</span>
          <span className="rc">
            <Icon name="check" />
          </span>
        </p>
      )}
      <HabitChips slugs={sharedSorted} tagMap={tagMap} starred={starred} max={5} />
      {match.existing_chat_room_id ? (
        <Btn variant="btn-outline indigo block" icon="chat" onClick={() => onConnect(match)}>
          Continue with {first}
        </Btn>
      ) : (
        <Btn
          variant="btn-indigo block"
          icon="userplus"
          busy={busy}
          busyLabel="Connecting…"
          onClick={() => onConnect(match)}
        >
          Connect 1v1
        </Btn>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Pod tile                                                            */
/* ------------------------------------------------------------------ */

export function memberLine(n: number, size: number) {
  const open = size - n;
  return `${n}/${size} Members${open > 0 ? `, ${open} open` : ', full'}`;
}

export function PodCard({
  pod,
  tagMap,
  starred,
  busy,
  failed,
  countUp,
  onJoin,
  onOpen,
}: {
  pod: PodResult;
  tagMap: Map<string, TaxonomyTag>;
  starred: Set<string>;
  busy: boolean;
  failed: boolean;
  countUp?: boolean;
  onJoin: (pod: PodResult) => void;
  onOpen: (pod: PodResult) => void;
}) {
  const n = pod.members.length || pod.member_count;
  const open = Math.max(0, pod.max_members - n);
  const full = open === 0;
  return (
    <li className="card pcard spot">
      <div className="p-cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={podCover(pod.title, pod.anchor_tags)} alt="" />
        <ScorePill pct={pod.score} countUp={countUp} className="amber" />
        {pod.is_joined && (
          <span className="badge">
            <Icon name="check" />
            Joined
          </span>
        )}
      </div>
      <div className="p-body">
        <div>
          <h3 className="h3">{pod.title}</h3>
          <p className="meta">
            <span>
              <Icon name="users" />
              {memberLine(n, pod.max_members)}
            </span>
            <span>
              <Icon name="clock" />
              {pod.meeting_cadence}
            </span>
          </p>
        </div>
        <HabitChips slugs={sortHabits(pod.anchor_tags, tagMap, starred)} tagMap={tagMap} starred={starred} />
        {failed && (
          <AlertBox
            title="We couldn’t add you to this pod."
            text="It may have just filled up. Search again and try another pod."
          />
        )}
        <div className="p-foot">
          <span className="stackav">
            {pod.members.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.user_id}
                className="avatar"
                src={m.profile.avatar_url}
                width={32}
                height={32}
                alt={m.profile.full_name}
              />
            ))}
            {open > 0 && (
              <span className="seat" title="Open seat">
                <Icon name="plus" />
                <span className="sr">{open} open</span>
              </span>
            )}
          </span>
          {pod.is_joined ? (
            <Btn variant="btn-outline" icon="chat" onClick={() => onOpen(pod)}>
              Open Chat
            </Btn>
          ) : full ? (
            <Btn variant="btn-amber" icon="lock" disabled>
              Pod Full
            </Btn>
          ) : (
            <Btn variant="btn-amber" icon="users" busy={busy} busyLabel="Joining…" onClick={() => onJoin(pod)}>
              Join Pod
            </Btn>
          )}
        </div>
      </div>
    </li>
  );
}

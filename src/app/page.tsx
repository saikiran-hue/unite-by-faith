'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TaxonomyTag } from '@/types/database';
import { useAppState } from '@/lib/useAppState';
import { AppShell } from '@/components/AppShell';
import { HabitsPanel } from '@/components/HabitsPanel';
import { CreatePodDialog } from '@/components/CreatePodDialog';
import { DuoCard, PodCard, type DuoResult, type PodResult } from '@/components/MatchCards';
import { AlertBox, Btn, Empty, Icon, Note, type IconName } from '@/components/ubf';
import { podCover } from '@/lib/sample-content';

type Kind = 'duo' | 'pods';
type Search = { kind: Kind; status: 'loading' | 'done' | 'error' | 'incomplete' };

type MatchFetch =
  | { ok: true; results: unknown[]; labels: Record<string, string>; emptyRule: string | null }
  | { ok: false; reason: 'incomplete' | 'signed_out' | 'error' };

/** What to tell a viewer whose search found nobody, by the narrowest rule, and where to change it. */
const EMPTY_BY_RULE: Record<string, { text: string; button: string; href?: string }> = {
  place: {
    text: 'Nobody near you yet. Try a wider distance or meeting online.',
    button: 'Change distance',
    href: '/onboarding#life-fit-distance',
  },
  age: { text: 'Nobody in your age range yet. Try widening it.', button: 'Change age range', href: '/onboarding#life-fit-agemin' },
  language: {
    text: 'Nobody shares your languages yet.',
    button: 'Change languages',
    href: '/onboarding#life-fit-languages',
  },
  gender: { text: 'No 1v1 matches yet. Try Search Groups.', button: 'Search Groups' },
  tradition: {
    text: 'Nobody from your tradition yet. Try turning off Only my tradition.',
    button: 'Change tradition',
    href: '/onboarding#life-fit-tradition',
  },
};

/** GET /api/match: the ranked results, or why there are none (Life fit missing, signed out, failure). */
async function fetchMatch(kind: Kind): Promise<MatchFetch> {
  try {
    const res = await fetch(`/api/match?kind=${kind}`);
    if (res.status === 401) return { ok: false, reason: 'signed_out' };
    if (res.status === 409) return { ok: false, reason: 'incomplete' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const data = await res.json();
    return { ok: true, results: data.results ?? [], labels: data.tag_labels ?? {}, emptyRule: data.emptyReason?.rule ?? null };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export default function Home() {
  const router = useRouter();
  const {
    loading,
    currentUser,
    taxonomyTags,
    joinedPods,
    duoChats,
    tagMap,
    startingDuoId,
    actionError,
    startDuoChat,
    refresh,
  } = useAppState();

  const [search, setSearch] = useState<Search | null>(null);
  const [searchId, setSearchId] = useState(0);
  const [duoRes, setDuoRes] = useState<DuoResult[]>([]);
  const [podRes, setPodRes] = useState<PodResult[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [emptyRule, setEmptyRule] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinFailedId, setJoinFailedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [editSignal, setEditSignal] = useState(0);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  // The home page can stay mounted (hidden) across sign-out and sign-in, so drop the previous
  // viewer's match results when the signed-in user changes.
  const viewerId = currentUser?.id ?? null;
  const [resultsViewerId, setResultsViewerId] = useState(viewerId);
  if (viewerId !== resultsViewerId) {
    setResultsViewerId(viewerId);
    setSearch(null);
    setDuoRes([]);
    setPodRes([]);
    setLabels({});
    setEmptyRule(null);
  }
  const viewerRef = useRef(viewerId);
  useEffect(() => {
    viewerRef.current = viewerId;
  }, [viewerId]);
  const searchSeq = useRef(0);

  async function runSearch(kind: Kind) {
    const seq = ++searchSeq.current;
    const startedFor = viewerRef.current;
    setSearch({ kind, status: 'loading' });
    setToast(null);
    setSaved(false);
    setJoinFailedId(null);
    // The chats lists refresh alongside; a failure there must not hide good match results.
    const [, found] = await Promise.all([refresh(), fetchMatch(kind)]);
    if (seq !== searchSeq.current || startedFor !== viewerRef.current) return;
    if (!found.ok && found.reason === 'signed_out') {
      router.replace('/auth');
      return;
    }
    if (found.ok) {
      setLabels(found.labels);
      setEmptyRule(found.emptyRule);
      if (kind === 'duo') setDuoRes(found.results as DuoResult[]);
      else setPodRes(found.results as PodResult[]);
    }
    setSearch({
      kind,
      status: found.ok ? 'done' : found.reason === 'incomplete' ? 'incomplete' : 'error',
    });
    setSearchId((n) => n + 1);
    requestAnimationFrame(() => resultsHeadingRef.current?.focus({ preventScroll: false }));
  }

  async function joinPod(pod: PodResult) {
    setJoiningId(pod.id);
    setJoinFailedId(null);
    setToast(null);
    try {
      const res = await fetch('/api/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', podId: pod.id }),
      });
      if (!res.ok) {
        setJoinFailedId(pod.id);
        return;
      }
      setPodRes((list) => list.map((p) => (p.id === pod.id ? { ...p, is_joined: true } : p)));
      await refresh();
      setToast(`You joined ${pod.title}.`);
    } catch {
      setJoinFailedId(pod.id);
    } finally {
      setJoiningId(null);
    }
  }

  if (!loading && !currentUser) {
    return (
      <AppShell currentUser={null}>
        <main className="wrap stack">
          <AlertBox
            title="We couldn’t load your habits."
            text="Check your connection, then tap Try Again. Nothing was lost."
            action={{ label: 'Try Again', onClick: () => void refresh() }}
          />
        </main>
      </AppShell>
    );
  }

  if (loading || !currentUser) {
    return (
      <AppShell currentUser={null}>
        <main className="wrap stack">
          <section className="card pad" aria-busy="true">
            <p className="sr" role="status">
              Loading your habits…
            </p>
            <div style={{ display: 'grid', gap: 12 }} aria-hidden="true">
              <span className="skel" style={{ height: 20, width: '30%' }} />
              <span className="skel" style={{ height: 14, width: '55%' }} />
              <span className="skel" style={{ height: 120, borderRadius: 18 }} />
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  const habits = currentUser.tags.map((t) => t.tag_slug);
  const starred = new Set(currentUser.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));
  const tooFew = habits.length < 3;
  const duoResults = duoRes;
  const podResults = podRes;
  // Habit labels, plus any label the match API sent for a habit the catalogue list does not have.
  const resultTagMap = new Map(tagMap);
  for (const [slug, label] of Object.entries(labels)) {
    if (!resultTagMap.has(slug)) resultTagMap.set(slug, { slug, label } as TaxonomyTag);
  }
  // Habits behind the top reasons, best first: they seed the chat's icebreakers.
  const sharedOf = (m: DuoResult) =>
    m.reasons.flatMap((r) => (r.kind === 'shared_tag' ? [r.slug] : r.kind === 'related_tag' ? [r.mine] : []));
  const podChats = joinedPods;
  const emptyCopy = emptyRule ? EMPTY_BY_RULE[emptyRule] : undefined;
  // The gender rule never narrows group search, so it falls back to the generic message.
  const podEmptyCopy = emptyRule && emptyRule !== 'gender' ? EMPTY_BY_RULE[emptyRule] : undefined;
  const fresh = search?.status === 'done';

  return (
    <AppShell
      currentUser={currentUser}
      onSwitchedUser={() => {
        setSearch(null);
        setToast(null);
        setSaved(false);
        void refresh();
      }}
    >
      <main className="wrap stack">
        <h1 className="sr">Find friends who share your habits</h1>

        <HabitsPanel
          key={currentUser.id}
          user={currentUser}
          taxonomyTags={taxonomyTags}
          tagMap={tagMap}
          saved={saved}
          editSignal={editSignal}
          onSaved={async () => {
            await refresh();
            setSearch(null);
            setToast(null);
            setSaved(true);
          }}
        />

        <div>
          <div className="actions" role="group" aria-label="Find friends">
            <BigBtn
              cls="btn-indigo"
              icon="search"
              label="Search 1v1"
              small="Find one friend"
              disabled={tooFew}
              busy={search?.kind === 'duo' && search.status === 'loading'}
              onClick={() => runSearch('duo')}
            />
            <BigBtn
              cls="btn-amber"
              icon="users"
              label="Search Groups"
              small="Find a pod of 3 to 4"
              disabled={tooFew}
              busy={search?.kind === 'pods' && search.status === 'loading'}
              onClick={() => runSearch('pods')}
            />
            <BigBtn
              cls="btn-outline"
              icon="plus"
              label="Create Group"
              small="Start your own pod"
              disabled={tooFew}
              onClick={() => {
                setCreateKey((k) => k + 1);
                setCreateOpen(true);
              }}
            />
          </div>
          {tooFew && (
            <p className="small" style={{ marginTop: 8 }}>
              Pick at least 3 habits to search or create a group.
            </p>
          )}
          {actionError && (
            <div style={{ marginTop: 12 }}>
              <AlertBox title="We couldn’t open that chat." text="Check your connection and tap Connect 1v1 again." />
            </div>
          )}
        </div>

        {search && (
          <section aria-labelledby="res-h" aria-busy={search.status === 'loading'} style={{ display: 'grid', gap: 12 }}>
            <div className="sec-head res-head">
              <div>
                <h2 className="h2" id="res-h" tabIndex={-1} ref={resultsHeadingRef}>
                  {search.kind === 'duo' ? '1v1 Matches for Your Habits' : 'Groups for Your Habits'}
                </h2>
                <p className="sub">
                  {search.status === 'loading'
                    ? search.kind === 'duo'
                      ? 'Finding people who share your habits…'
                      : 'Finding groups that fit your habits…'
                    : search.status === 'incomplete'
                      ? 'One more step before we can match you.'
                      : `Matched on your ${habits.length} habits${
                        search.status === 'done'
                          ? `, ${search.kind === 'duo' ? duoResults.length : podResults.length} found`
                          : ''
                      }`}
                </p>
              </div>
              {search.status === 'done' && (
                <Btn variant="btn-text" onClick={() => { setSearch(null); setToast(null); }}>
                  Clear Results
                </Btn>
              )}
            </div>
            {toast && <Note>{toast}</Note>}

            {search.status === 'loading' && <Skeletons />}

            {search.status === 'incomplete' && (
              <div className="card pad" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
                <Note>Add your Life fit details to search.</Note>
                <Link className="btn btn-amber" href="/onboarding#life-fit">
                  <Icon name="pencil" />
                  Add Life fit details
                </Link>
              </div>
            )}

            {search.status === 'error' && (
              <AlertBox
                title="We couldn’t finish your search."
                text="Check your connection, then tap Try Again. Your habits are saved."
                action={{ label: 'Try Again', onClick: () => runSearch(search.kind) }}
              />
            )}

            {search.status === 'done' &&
              (search.kind === 'duo' ? (
                duoResults.length ? (
                  <ul className="results-grid stagger" key={searchId}>
                    {duoResults.map((m) => (
                      <DuoCard
                        key={m.partner.id}
                        match={m}
                        tagMap={resultTagMap}
                        busy={startingDuoId === m.partner.id}
                        countUp={fresh}
                        onConnect={(r) =>
                          startDuoChat({
                            partner: r.partner,
                            existing_chat_room_id: r.existing_chat_room_id,
                            shared_tags: sharedOf(r),
                            similarity_score: r.score,
                          })
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="card">
                    {emptyCopy ? (
                      <Empty icon="user" title="No matches yet" text={emptyCopy.text}>
                        {emptyCopy.href ? (
                          <Link className="btn btn-outline" href={emptyCopy.href}>
                            {emptyCopy.button}
                          </Link>
                        ) : (
                          <Btn variant="btn-outline" icon="users" onClick={() => runSearch('pods')}>
                            {emptyCopy.button}
                          </Btn>
                        )}
                      </Empty>
                    ) : (
                      <Empty icon="user" title="No one shares your habits yet." text="Add a few more habits and search again.">
                        <Btn variant="btn-outline" icon="pencil" onClick={() => setEditSignal((n) => n + 1)}>
                          Edit Habits
                        </Btn>
                      </Empty>
                    )}
                  </div>
                )
              ) : podResults.length ? (
                <ul className="results-grid stagger" key={searchId}>
                  {podResults.map((p) => (
                    <PodCard
                      key={p.id}
                      pod={p}
                      tagMap={resultTagMap}
                      starred={starred}
                      busy={joiningId === p.id}
                      failed={joinFailedId === p.id}
                      countUp={fresh}
                      onJoin={joinPod}
                      onOpen={(pod) => router.push(`/rooms/${pod.chat_room_id}`)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="card">
                  {podEmptyCopy ? (
                    <Empty icon="users" title="No groups yet" text={podEmptyCopy.text}>
                      {podEmptyCopy.href && (
                        <Link className="btn btn-outline" href={podEmptyCopy.href}>
                          {podEmptyCopy.button}
                        </Link>
                      )}
                      <Btn variant="btn-amber" icon="plus" onClick={() => { setCreateKey((k) => k + 1); setCreateOpen(true); }}>
                        Create Group
                      </Btn>
                    </Empty>
                  ) : (
                    <Empty icon="users" title="No groups match your habits yet." text="Create one and invite people who share your rhythms.">
                      <Btn variant="btn-amber" icon="plus" onClick={() => { setCreateKey((k) => k + 1); setCreateOpen(true); }}>
                        Create Group
                      </Btn>
                    </Empty>
                  )}
                </div>
              ))}
          </section>
        )}

        <div className="lists">
          <section className="card" aria-labelledby="l1">
            <div className="list-head">
              <h2 className="h3" id="l1">
                1v1 Chats
              </h2>
            </div>
            {duoChats.length ? (
              <ul className="list">
                {duoChats.map((m) => (
                  <li key={m.partner.id}>
                    <Link href={`/rooms/${m.chat_room_id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="avatar" src={m.partner.avatar_url} width={44} height={44} alt="" />
                      <span className="grow">
                        <b className="trunc">{m.partner.full_name}</b>
                        <span className="small trunc" style={{ display: 'block' }}>
                          {m.partner.headline}
                        </span>
                      </span>
                      <span className="go">
                        <Icon name="right" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="chat" title="No 1v1 Chats Yet" text="Tap Search 1v1 to find a friend who shares your habits." />
            )}
          </section>
          <section className="card" aria-labelledby="l2">
            <div className="list-head">
              <h2 className="h3" id="l2">
                Group Chats
              </h2>
            </div>
            {podChats.length ? (
              <ul className="list">
                {podChats.map((p) => (
                  <li key={p.id}>
                    <Link href={`/rooms/${p.chat_room_id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="thumb" src={podCover(p.title, p.anchor_tags)} alt="" />
                      <span className="grow">
                        <b className="trunc">{p.title}</b>
                        <span className="small" style={{ display: 'block' }}>
                          {p.members.length || p.member_count}/{p.max_members} members
                        </span>
                      </span>
                      <span className="go">
                        <Icon name="right" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="users" title="No Group Chats Yet" text="Tap Search Groups to join a pod, or create your own." />
            )}
          </section>
        </div>
      </main>

      <CreatePodDialog
        key={createKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tagMap={tagMap}
        habits={habits}
        starred={starred}
      />
    </AppShell>
  );
}

function BigBtn({
  cls,
  icon,
  label,
  small,
  disabled,
  busy = false,
  onClick,
}: {
  cls: string;
  icon: IconName;
  label: string;
  small: string;
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`btn btn-big ${cls}`} aria-busy={busy || undefined} disabled={disabled} onClick={onClick}>
      <span className="tile">{busy ? <span className="spin" aria-hidden="true" /> : <Icon name={icon} />}</span>
      <span>
        {busy ? 'Searching…' : label}
        <small>{small}</small>
      </span>
      <Icon name="arrow" className="arrow" />
    </button>
  );
}

function Skeletons() {
  const one = (i: number) => (
    <li key={i} className="card mcard" aria-hidden="true">
      <div className="m-top">
        <span className="skel" style={{ width: 56, height: 56, borderRadius: '50%' }} />
        <div className="grow" style={{ display: 'grid', gap: 8 }}>
          <span className="skel" style={{ height: 16, width: '60%' }} />
          <span className="skel" style={{ height: 12, width: '85%' }} />
        </div>
      </div>
      <span className="skel" style={{ height: 36 }} />
      <span className="skel" style={{ height: 26, width: '75%' }} />
      <span className="skel" style={{ height: 44, borderRadius: 12 }} />
    </li>
  );
  return <ul className="results-grid">{[0, 1, 2].map(one)}</ul>;
}

'use client';

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TaxonomyTag } from '@/types/database';
import { useAppState } from '@/lib/useAppState';
import { AppShell } from '@/components/AppShell';
import { HabitsPanel } from '@/components/HabitsPanel';
import { CreatePodDialog } from '@/components/CreatePodDialog';
import { DuoCard, PodCard, type DuoResult, type PodResult } from '@/components/MatchCards';
import { AlertBox, Btn, Empty, Icon, Note, type IconName } from '@/components/ubf';
import { podCover } from '@/lib/sample-content';
import { parseTab, recentChats, relTime, type RecentChat, type Tab } from '@/lib/home-tabs';

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

const TAB_ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'matches', label: 'Match', icon: 'search' },
  { id: 'chats', label: 'Chats', icon: 'chat' },
  { id: 'habits', label: 'Habits', icon: 'star' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

/** The desktop breakpoint in globals.css: Home has room for more recent chats there. */
const DESKTOP = '(min-width: 1024px)';
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

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

export default function Page() {
  // useSearchParams needs a Suspense boundary in a client page.
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    loading,
    currentUser,
    taxonomyTags,
    joinedPods,
    duoChats,
    lastMessages,
    unread,
    tagMap,
    startingDuoId,
    actionError,
    setActionError,
    startDuoChat,
    refresh,
  } = useAppState();

  // The tab lives in the URL (?tab=chats) so a reload or Back from a chat lands on the same tab.
  // Tabs are peers: switching replaces the history entry instead of stacking one per tap.
  const urlTab = parseTab(params.get('tab'));
  const [tab, setTabState] = useState<Tab>(urlTab);
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setTabState(urlTab);
  }
  function setTab(next: Tab) {
    setTabState(next);
    window.history.replaceState(null, '', next === 'home' ? '/' : `/?tab=${next}`);
    window.scrollTo({ top: 0 });
  }

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
  const [chatFilter, setChatFilter] = useState<'all' | 'duo' | 'pod'>('all');
  const [now, setNow] = useState<Date | null>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  // The server and phones show 5 recent chats and the tab bar last; desktop shows 8 and the sidebar first.
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const recentMax = desktop ? 8 : 5;

  // Chat times need the clock, which must not be read during render.
  useEffect(() => {
    queueMicrotask(() => setNow(new Date()));
  }, [lastMessages]);

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
    setTab('matches');
    setActionError(null);
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
    requestAnimationFrame(() => resultsHeadingRef.current?.focus({ preventScroll: true }));
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
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
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

  async function signOut() {
    try {
      await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'signout' }),
      });
    } finally {
      router.replace('/auth');
      router.refresh();
    }
  }

  const openCreate = () => {
    setCreateKey((k) => k + 1);
    setCreateOpen(true);
  };

  if (!loading && !currentUser) {
    return (
      <AppShell currentUser={null} width="app">
        <main className="wrap w-app stack">
          <AlertBox
            title="We couldn’t load your home page."
            text="Check your connection, then tap Try Again. Nothing was lost."
            action={{ label: 'Try Again', onClick: () => void refresh() }}
          />
        </main>
      </AppShell>
    );
  }

  if (loading || !currentUser) {
    return (
      <AppShell currentUser={null} width="app">
        <main className="wrap w-app stack">
          <section className="card pad" aria-busy="true">
            <p className="sr" role="status">
              Loading your home page…
            </p>
            <div style={{ display: 'grid', gap: 12 }} aria-hidden="true">
              <span className="skel" style={{ height: 24, width: '40%' }} />
              <div className="hero-btns">
                <span className="skel" style={{ height: 160, borderRadius: 28 }} />
                <span className="skel" style={{ height: 160, borderRadius: 28 }} />
              </div>
              <span className="skel" style={{ height: 64, borderRadius: 20 }} />
              <span className="skel" style={{ height: 64, borderRadius: 20 }} />
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  const habits = currentUser.tags.map((t) => t.tag_slug);
  const starred = new Set(currentUser.tags.filter((t) => t.is_priority).map((t) => t.tag_slug));
  const tooFew = habits.length < 3;
  // Habit labels, plus any label the match API sent for a habit the catalogue list does not have.
  const resultTagMap = new Map(tagMap);
  for (const [slug, label] of Object.entries(labels)) {
    if (!resultTagMap.has(slug)) resultTagMap.set(slug, { slug, label } as TaxonomyTag);
  }
  // Habits behind the top reasons, best first: they seed the chat's icebreakers.
  const sharedOf = (m: DuoResult) =>
    m.reasons.flatMap((r) => (r.kind === 'shared_tag' ? [r.slug] : r.kind === 'related_tag' ? [r.mine] : []));
  const emptyCopy = emptyRule ? EMPTY_BY_RULE[emptyRule] : undefined;
  // The gender rule never narrows group search, so it falls back to the generic message.
  const podEmptyCopy = emptyRule && emptyRule !== 'gender' ? EMPTY_BY_RULE[emptyRule] : undefined;
  const fresh = search?.status === 'done';
  const chats = recentChats(duoChats, joinedPods, lastMessages, currentUser.id, unread);
  const totalUnread = chats.reduce((n, c) => n + c.unread, 0);
  const shownChats = chatFilter === 'all' ? chats : chats.filter((c) => c.kind === chatFilter);
  const first = currentUser.full_name.split(' ')[0];

  const chatList = (list: RecentChat[]) => (
    <ul className="list crows">
      {list.map((c) => (
        <li key={c.roomId}>
          <Link href={`/rooms/${c.roomId}`}>
            {c.kind === 'duo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar" src={c.avatar ?? ''} width={48} height={48} alt="" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={podCover(c.pod!.title, c.pod!.anchor_tags)} alt="" />
            )}
            <span className="grow crow">
              <span className="crow-top">
                <b className={`trunc${c.unread > 0 ? ' unread' : ''}`}>{c.name}</b>
                {c.at && now && (
                  <time className="crow-time" dateTime={c.at}>
                    {relTime(c.at, now)}
                  </time>
                )}
              </span>
              <span className="crow-bot">
                <span className={`crow-prev trunc${c.unread > 0 ? ' unread' : ''}`}>
                  <span className="crow-kind">{c.kind === 'duo' ? '1v1' : 'Group'}</span>
                  {c.preview ?? 'No messages yet. Say hello.'}
                </span>
                {c.unread > 0 && (
                  <span className={`ucount ${c.kind}`}>
                    <span aria-hidden="true">{c.unread > 99 ? '99+' : c.unread}</span>
                    <span className="sr">{c.unread} unread</span>
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  // One tab bar: after the panels on phones (a bottom bar), before them on desktop (a sidebar), so
  // keyboard order follows what is on screen.
  const nav = (
    <nav className="tabbar" aria-label="Main">
      {TAB_ITEMS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
        >
          <Icon name={t.icon} />
          <span>
            {t.label}
            {t.id === 'chats' && totalUnread > 0 && <span className="sr">, {totalUnread > 99 ? '99+' : totalUnread} unread</span>}
          </span>
          {t.id === 'chats' && totalUnread > 0 && (
            <span className="ucount tab" aria-hidden="true">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <AppShell
      currentUser={currentUser}
      width="app"
      onSwitchedUser={() => {
        setSearch(null);
        setToast(null);
        setSaved(false);
        setTab('home');
        void refresh();
      }}
    >
      <main className="wrap w-app app">
        {desktop && nav}
        <div className="app-body">
          {/* ---------------- Home ---------------- */}
          <section hidden={tab !== 'home'} aria-labelledby="home-h" className="tabpanel home-panel">
            <div className="greet">
              <h1 className="h1" id="home-h">
                Hi, {first}
              </h1>
              <p className="sub">Find friends who share your faith and your everyday life.</p>
            </div>

            <div className="hero-btns" role="group" aria-label="Find friends">
              <button
                type="button"
                className="hero-btn duo"
                disabled={tooFew}
                aria-busy={(search?.kind === 'duo' && search.status === 'loading') || undefined}
                onClick={() => runSearch('duo')}
              >
                <span className="tile">
                  <Icon name="user" />
                </span>
                <span>
                  <b>1v1 Match</b>
                  <small>Find one friend</small>
                </span>
              </button>
              <button
                type="button"
                className="hero-btn group"
                disabled={tooFew}
                aria-busy={(search?.kind === 'pods' && search.status === 'loading') || undefined}
                onClick={() => runSearch('pods')}
              >
                <span className="tile">
                  <Icon name="users" />
                </span>
                <span>
                  <b>Group Match</b>
                  <small>Join a pod of 3 to 4</small>
                </span>
              </button>
            </div>
            {tooFew ? (
              <div className="card pad" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
                <Note>Pick at least 3 habits so we can match you.</Note>
                <Btn variant="btn-amber" icon="star" onClick={() => setTab('habits')}>
                  Pick Habits
                </Btn>
              </div>
            ) : (
              <button type="button" className="create-row" onClick={openCreate}>
                <span className="tile">
                  <Icon name="plus" />
                </span>
                <span className="grow">
                  <b>Create Group</b>
                  <small>Start your own pod and invite others</small>
                </span>
                <Icon name="right" />
              </button>
            )}

            <section className="card recent-card" aria-labelledby="recent-h">
              <div className="list-head">
                <h2 className="h3" id="recent-h">
                  Recent Messages
                </h2>
                {chats.length > recentMax && (
                  <button type="button" className="btn btn-text" onClick={() => setTab('chats')}>
                    See All
                  </button>
                )}
              </div>
              {chats.length ? (
                chatList(chats.slice(0, recentMax))
              ) : (
                <Empty icon="chat" title="No Messages Yet" text="Tap 1v1 Match or Group Match to meet someone who shares your habits." />
              )}
            </section>
          </section>

          {/* ---------------- Match ---------------- */}
          <section hidden={tab !== 'matches'} aria-labelledby="res-h" aria-busy={search?.status === 'loading'} className="tabpanel">
            <div className="sec-head res-head">
              <div>
                <h1 className="h2" id="res-h" tabIndex={-1} ref={resultsHeadingRef}>
                  {!search ? 'Find Friends' : search.kind === 'duo' ? '1v1 Matches for You' : 'Groups for You'}
                </h1>
                <p className="sub">
                  {!search
                    ? 'Pick 1v1 or Groups to search.'
                    : search.status === 'loading'
                      ? search.kind === 'duo'
                        ? 'Finding people who share your habits…'
                        : 'Finding groups that fit your habits…'
                      : search.status === 'incomplete'
                        ? 'One more step before we can match you.'
                        : `Matched on your ${habits.length} habits${
                          search.status === 'done'
                            ? `, ${search.kind === 'duo' ? duoRes.length : podRes.length} found`
                            : ''
                        }`}
                </p>
              </div>
            </div>
            <div className="seg" role="radiogroup" aria-label="Match type">
              {(
                [
                  ['duo', '1v1'],
                  ['pods', 'Groups'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={search?.kind === k}
                  disabled={tooFew || search?.status === 'loading'}
                  onClick={() => runSearch(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tooFew && (
              <p className="small">
                Pick at least 3 habits to search.{' '}
                <button type="button" className="btn btn-text" onClick={() => setTab('habits')}>
                  Pick Habits
                </button>
              </p>
            )}
            {toast && <Note>{toast}</Note>}
            {actionError && (
              <AlertBox title="We couldn’t open that chat." text="Check your connection and tap Connect 1v1 again." />
            )}

            {search?.status === 'loading' && <Skeletons />}

            {search?.status === 'incomplete' && (
              <div className="card pad" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
                <Note>Add your Life Fit details to search.</Note>
                <Link className="btn btn-amber" href="/onboarding#life-fit">
                  <Icon name="pencil" />
                  Add Life Fit Details
                </Link>
              </div>
            )}

            {search?.status === 'error' && (
              <AlertBox
                title="We couldn’t finish your search."
                text="Check your connection, then tap Try Again. Your habits are saved."
                action={{ label: 'Try Again', onClick: () => runSearch(search.kind) }}
              />
            )}

            {search?.status === 'done' &&
              (search.kind === 'duo' ? (
                duoRes.length ? (
                  <ul className="results-grid stagger" key={searchId}>
                    {duoRes.map((m) => (
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
                        <Btn
                          variant="btn-outline"
                          icon="pencil"
                          id="res-edit-habits"
                          aria-haspopup="dialog"
                          onClick={() => {
                            setTab('habits');
                            setEditSignal((n) => n + 1);
                          }}
                        >
                          Edit Habits
                        </Btn>
                      </Empty>
                    )}
                  </div>
                )
              ) : podRes.length ? (
                <ul className="results-grid stagger" key={searchId}>
                  {podRes.map((p) => (
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
                      <Btn variant="btn-amber" icon="plus" onClick={openCreate}>
                        Create Group
                      </Btn>
                    </Empty>
                  ) : (
                    <Empty icon="users" title="No groups match your habits yet." text="Create one and invite people who share your rhythms.">
                      <Btn variant="btn-amber" icon="plus" onClick={openCreate}>
                        Create Group
                      </Btn>
                    </Empty>
                  )}
                </div>
              ))}
          </section>

          {/* ---------------- Chats ---------------- */}
          <section hidden={tab !== 'chats'} aria-labelledby="chats-h" className="tabpanel narrow-panel">
            <h1 className="h2" id="chats-h">
              Chats
            </h1>
            <div className="seg three" role="radiogroup" aria-label="Show chats">
              {(
                [
                  ['all', 'All'],
                  ['duo', '1v1'],
                  ['pod', 'Groups'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={chatFilter === k} onClick={() => setChatFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
            <section className="card" aria-label="Chat list">
              {shownChats.length ? (
                chatList(shownChats)
              ) : chatFilter === 'pod' ? (
                <Empty icon="users" title="No Group Chats Yet" text="Tap Group Match to join a pod, or create your own.">
                  <Btn variant="btn-amber" icon="users" disabled={tooFew} onClick={() => runSearch('pods')}>
                    Group Match
                  </Btn>
                </Empty>
              ) : (
                <Empty
                  icon="chat"
                  title={chatFilter === 'duo' ? 'No 1v1 Chats Yet' : 'No Chats Yet'}
                  text="Tap 1v1 Match to find a friend who shares your habits."
                >
                  <Btn variant="btn-indigo" icon="user" disabled={tooFew} onClick={() => runSearch('duo')}>
                    1v1 Match
                  </Btn>
                </Empty>
              )}
            </section>
          </section>

          {/* ---------------- Habits ---------------- */}
          <section hidden={tab !== 'habits'} aria-label="My Habits" className="tabpanel">
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
          </section>

          {/* ---------------- Profile ---------------- */}
          <section hidden={tab !== 'profile'} aria-labelledby="prof-h" className="tabpanel narrow-panel">
            <div className="card pad prof-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="avatar" src={currentUser.avatar_url} width={72} height={72} alt="" />
              <div style={{ minWidth: 0 }}>
                <h1 className="h2" id="prof-h">
                  {currentUser.full_name}
                </h1>
                {currentUser.headline && <p className="sub trunc">{currentUser.headline}</p>}
              </div>
            </div>
            <ul className="list prof-links">
              <li>
                <Link href="/onboarding">
                  <Icon name="pencil" />
                  <span className="grow">Profile Details</span>
                  <Icon name="right" />
                </Link>
              </li>
              <li>
                <button type="button" onClick={() => setTab('habits')}>
                  <Icon name="star" />
                  <span className="grow">My Habits</span>
                  <Icon name="right" />
                </button>
              </li>
              <li>
                <Link href="/privacy">
                  <Icon name="lock" />
                  <span className="grow">Privacy Policy</span>
                  <Icon name="right" />
                </Link>
              </li>
              <li>
                <Link href="/terms">
                  <Icon name="file" />
                  <span className="grow">Terms of Service</span>
                  <Icon name="right" />
                </Link>
              </li>
              <li>
                <a href="https://github.com/saikiran-hue/unite-by-faith" target="_blank" rel="noopener noreferrer">
                  <Icon name="github" />
                  <span className="grow">Source Code on GitHub</span>
                  <Icon name="right" />
                </a>
              </li>
              <li>
                <button type="button" onClick={signOut}>
                  <Icon name="back" />
                  <span className="grow">Sign Out</span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        {!desktop && nav}
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

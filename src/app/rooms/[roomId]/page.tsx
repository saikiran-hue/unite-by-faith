'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  AlertBox,
  Btn,
  Empty,
  HabitChips,
  Icon,
  ScorePill,
  Spinner,
  sortHabits,
} from '@/components/ubf';
import { podCover } from '@/lib/sample-content';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ChatMessage,
  ChatRoom,
  RoomPin,
  TaxonomyTag,
  UserProfile,
} from '@/types/database';

interface RoomParticipant {
  user_id: string;
  role: string;
  profile: UserProfile;
}

type SendKind = 'text' | 'icebreaker' | 'prayer';

/** A message the user posted that the server has not confirmed yet. */
interface PendingMessage {
  key: number;
  kind: SendKind;
  text: string;
  at: string;
  status: 'sending' | 'failed';
}

const firstName = (name?: string) => (name || 'Member').split(' ')[0];

const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Older messages carry an emoji prefix and pin wording; the design shows plain text. */
function displayText(content: string) {
  return content
    .replace(/^\p{Extended_Pictographic}️?\s*/u, '')
    .replace(/^Shared (?:Prayer Request|Fellowship Goal): "(.*?)"/, '$1');
}

function FellowshipRoomContent() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params?.roomId || '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [taxonomyTags, setTaxonomyTags] = useState<TaxonomyTag[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pins, setPins] = useState<RoomPin[]>([]);
  const [contextualIcebreakers, setContextualIcebreakers] = useState<
    { category: string; title: string; prompt: string }[]
  >([]);
  const [podDetails, setPodDetails] = useState<{
    id: string;
    member_count: number;
    max_members: number;
    meeting_cadence: string;
  } | null>(null);
  const [duoSimilarityScore, setDuoSimilarityScore] = useState<number | null>(
    null
  );

  // Composer
  const [messageText, setMessageText] = useState('');
  const [prayerMode, setPrayerMode] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sentNote, setSentNote] = useState('');
  const pendingKey = useRef(0);

  // Prayer & Goals board
  const [boardType, setBoardType] = useState<'prayer' | 'goal'>('prayer');
  const [boardText, setBoardText] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [boardError, setBoardError] = useState<{ title: string; text: string } | null>(null);
  const [amened, setAmened] = useState<Set<string>>(new Set());
  const [spark, setSpark] = useState<string | null>(null);
  const [busyPin, setBusyPin] = useState<string | null>(null);

  const msgsRef = useRef<HTMLUListElement | null>(null);

  const fetchRoomData = React.useCallback(
    async (silent = false) => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (res.status === 401) {
          router.replace('/auth');
          return;
        }
        const data = await res.json();
        if (res.ok && data.room) {
          setRoom(data.room);
          setCurrentUser(data.currentUser);
          setTaxonomyTags(data.taxonomyTags || []);
          setParticipants(data.participants || []);
          setMessages(data.messages || []);
          setPins(data.pins || []);
          setContextualIcebreakers(data.contextualIcebreakers || []);
          setPodDetails(data.podDetails || null);
          setDuoSimilarityScore(data.duoSimilarityScore || null);
          setLoadError(false);
        } else if (!silent) {
          setLoadError(true);
        }
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [roomId, router]
  );

  useEffect(() => {
    if (!roomId) return;
    // First load runs after the effect, so no state is set synchronously in it.
    void Promise.resolve().then(() => fetchRoomData(false));

    // Subscribe to Supabase Realtime postgres_changes on chat_messages and room_pins.
    // Only room members can read these rows (RLS), so the socket must carry the user's JWT.
    const supabase = createSupabaseBrowserClient();
    let closed = false;
    const channel = supabase
      .channel(`fellowship_room_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchRoomData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_pins',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchRoomData(true);
        }
      );
    void supabase.auth.getSession().then(async ({ data }) => {
      if (closed) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!closed) channel.subscribe();
    });

    return () => {
      closed = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    // Scroll only the message list, never the page.
    const list = msgsRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending.length]);

  const tagMap = new Map(taxonomyTags.map((t) => [t.slug, t]));

  function retryLoad() {
    setLoading(true);
    setLoadError(false);
    void fetchRoomData(false);
  }

  /** Post to the API. A prayer request is pinned to the board; the server also posts it to the chat. */
  async function deliver(kind: SendKind, text: string) {
    const body =
      kind === 'prayer'
        ? { action: 'create_pin', senderId: currentUser?.id, pinType: 'prayer', title: text, body: '' }
        : { action: 'message', senderId: currentUser?.id, content: text, messageType: kind };
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) router.replace('/auth');
      return res.ok;
    } catch {
      return false;
    }
  }

  async function sendPending(m: PendingMessage) {
    const ok = await deliver(m.kind, m.text);
    if (ok) {
      await fetchRoomData(true);
      setPending((list) => list.filter((x) => x.key !== m.key));
      setSentNote(m.kind === 'prayer' ? 'Prayer request sent and pinned.' : 'Message sent.');
    } else {
      setPending((list) =>
        list.map((x) => (x.key === m.key ? { ...x, status: 'failed' } : x))
      );
    }
  }

  function post(kind: SendKind, text: string) {
    const m: PendingMessage = {
      key: ++pendingKey.current,
      kind,
      text,
      at: clock(new Date()),
      status: 'sending',
    };
    setSentNote('');
    setPending((list) => [...list, m]);
    void sendPending(m);
  }

  function retry(key: number) {
    const m = pending.find((x) => x.key === key);
    if (!m) return;
    const next = { ...m, status: 'sending' as const };
    setPending((list) => list.map((x) => (x.key === key ? next : x)));
    void sendPending(next);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text) return;
    post(prayerMode ? 'prayer' : 'text', text);
    setMessageText('');
    setPrayerMode(false);
  }

  async function boardCall(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) router.replace('/auth');
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    const title = boardText.trim();
    if (!title || savingPin) return;
    setSavingPin(true);
    setBoardError(null);
    const ok = await boardCall({
      action: 'create_pin',
      senderId: currentUser?.id,
      pinType: boardType,
      title,
      body: '',
    });
    if (ok) {
      setBoardText('');
      await fetchRoomData(true);
    } else {
      setBoardError({
        title: 'We couldn’t pin that.',
        text: 'Your text is still in the box. Check your connection, then tap Pin to Board again.',
      });
    }
    setSavingPin(false);
  }

  async function handleAmenPin(pinId: string) {
    // The API only adds an Amen, so a pressed Amen stays pressed.
    if (amened.has(pinId)) return;
    setBoardError(null);
    setAmened((s) => new Set(s).add(pinId));
    setSpark(pinId);
    const ok = await boardCall({ action: 'amen_pin', pinId });
    if (ok) {
      await fetchRoomData(true);
    } else {
      setAmened((s) => {
        const n = new Set(s);
        n.delete(pinId);
        return n;
      });
      setBoardError({
        title: 'Your Amen didn’t go through.',
        text: 'Check your connection, then tap Amen again.',
      });
    }
    setSpark(null);
  }

  async function handleMarkAnswered(pin: RoomPin) {
    if (busyPin) return;
    setBusyPin(pin.id);
    setBoardError(null);
    const ok = await boardCall({ action: 'toggle_answered', pinId: pin.id });
    if (ok) {
      await fetchRoomData(true);
    } else {
      const label = pin.pin_type === 'goal' ? 'Mark Done' : 'Mark Answered';
      setBoardError({
        title: 'We couldn’t update that pin.',
        text: `Check your connection, then tap ${label} again.`,
      });
    }
    setBusyPin(null);
  }

  const shell = (children: React.ReactNode) => (
    <AppShell
      currentUser={currentUser}
      onSwitchedUser={() => fetchRoomData(false)}
    >
      {children}
    </AppShell>
  );

  if (loadError && !room) {
    return shell(
      <main className="wrap" style={{ paddingTop: 12, paddingBottom: 32 }}>
        <AlertBox
          title="We couldn’t open this room."
          text="It may have been removed, or the connection dropped. Tap Try Again."
          action={{ label: 'Try Again', onClick: retryLoad }}
        />
      </main>
    );
  }

  if (loading || !room) {
    return shell(
      <main className="wrap">
        <p className="empty" role="status">
          <Spinner />
          Connecting to room…
        </p>
      </main>
    );
  }

  const pod = room.room_type === 'pod_group';
  const meId = currentUser?.id;
  const me = participants.find((p) => p.user_id === meId);
  const members = me
    ? [me, ...participants.filter((p) => p !== me)]
    : participants;
  const partner = participants.find((p) => p.user_id !== meId);
  const size = podDetails?.max_members || 4;
  const openSeats = Math.max(0, size - members.length);
  const starred = new Set(
    (currentUser?.tags || []).filter((t) => t.is_priority).map((t) => t.tag_slug)
  );
  const habits = sortHabits(room.shared_tags || [], tagMap, starred);
  const profileById = new Map(participants.map((p) => [p.user_id, p.profile]));

  const backLink = (
    <Link href="/" className="icon-btn" aria-label="Back to Home">
      <Icon name="back" />
    </Link>
  );

  const head = pod ? (
    <header className="chat-head pod on-dark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bg" src={podCover(room.title, room.shared_tags || [])} alt="" />
      <div className="wrap">
        <div className="row wrapx">
          {backLink}
          <span className="badge pod">
            <Icon name="users" />
            Fellowship Pod
          </span>
          <span className="badge live">
            <i />
            Live
          </span>
        </div>
        <div>
          <h1 className="h1">{room.title}</h1>
          {podDetails?.meeting_cadence && (
            <p className="sub row" style={{ gap: 6, marginTop: 4 }}>
              <Icon name="clock" />
              {podDetails.meeting_cadence}
            </p>
          )}
        </div>
        {habits.length > 0 && <HabitChips slugs={habits} tagMap={tagMap} />}
        <div className="row">
          <span className="stackav">
            {members.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.user_id}
                className="avatar"
                src={p.profile.avatar_url}
                width={32}
                height={32}
                alt={p.profile.full_name}
              />
            ))}
          </span>
          <b>
            {members.length}/{size} Members
          </b>
        </div>
      </div>
    </header>
  ) : (
    <header className="chat-head duo">
      <div className="wrap">
        <div className="row wrapx">
          {backLink}
          <span className="badge duo">
            <Icon name="user" />
            1v1 Duo Match
          </span>
          {duoSimilarityScore ? (
            <ScorePill pct={Math.round(duoSimilarityScore)} className="solid" />
          ) : null}
        </div>
        <div className="row">
          <span className="duo-av">
            {members.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.user_id}
                className="avatar"
                src={p.profile.avatar_url}
                width={56}
                height={56}
                alt={p.profile.full_name}
              />
            ))}
          </span>
          <div className="grow">
            <h1 className="h1" style={{ fontSize: 24 }}>
              {partner?.profile.full_name || room.title}
            </h1>
            {partner?.profile.headline && (
              <p className="sub">{partner.profile.headline}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  const starters = contextualIcebreakers.length > 0 && (
    <div className="starters">
      <p className="legend">
        <Icon name="bulb" />
        Conversation Starters. Tap one to post it.
      </p>
      <div
        className="st-row"
        tabIndex={0}
        role="group"
        aria-label="Conversation starters, scroll sideways for more"
      >
        {contextualIcebreakers.map((ib, idx) => (
          <button
            key={idx}
            type="button"
            className="st"
            onClick={() => post('icebreaker', `${ib.category}: ${ib.prompt}`)}
          >
            <b>{ib.category}</b>
            <span>{ib.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderMessage = (opts: {
    key: string;
    mine: boolean;
    type: ChatMessage['message_type'];
    text: string;
    avatar?: string;
    name?: string;
    time: React.ReactNode;
    status?: PendingMessage['status'];
  }) => {
    const special =
      opts.type === 'icebreaker' ||
      opts.type === 'prayer_request' ||
      opts.type === 'milestone';
    const kind =
      opts.type === 'icebreaker' ? (
        <span className="kind">
          <Icon name="bulb" />
          Conversation Starter
        </span>
      ) : opts.type === 'prayer_request' ? (
        <span className="kind">
          <Icon name="heart" />
          Prayer Request
        </span>
      ) : opts.type === 'milestone' ? (
        <span className="kind">
          <Icon name="target" />
          Personal Goal
        </span>
      ) : null;
    const first = firstName(opts.name);
    const showName = !opts.mine && (pod || special);
    const label = special ? (opts.mine ? 'You' : first) : first;
    const cls = [
      'msg',
      opts.mine && !special ? 'me' : '',
      special ? `special ${opts.type === 'prayer_request' ? 'prayer' : opts.type === 'icebreaker' ? 'starter' : opts.type}` : '',
      opts.status === 'sending' ? 'pending pop' : '',
      opts.status === 'failed' ? 'failed' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <li key={opts.key} className={cls}>
        {opts.mine && !special ? null : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="avatar" src={opts.avatar} width={32} height={32} alt="" />
        )}
        <div>
          {showName || special ? (
            <p className="who">{label}</p>
          ) : (
            <span className="sr">{opts.mine ? 'You' : first}: </span>
          )}
          <div className="bubble">
            {kind}
            {opts.text}
          </div>
          {opts.time}
        </div>
      </li>
    );
  };

  const kindToType = (k: SendKind): ChatMessage['message_type'] =>
    k === 'prayer' ? 'prayer_request' : k;

  const msgItems = [
    ...messages.map((m) =>
      renderMessage({
        key: m.id,
        mine: m.sender_id === meId,
        type: m.message_type,
        text: displayText(m.content),
        avatar: m.sender?.avatar_url,
        name: m.sender?.full_name,
        time: <time dateTime={m.created_at}>{clock(new Date(m.created_at))}</time>,
      })
    ),
    ...pending.map((m) =>
      renderMessage({
        key: `p${m.key}`,
        mine: true,
        type: kindToType(m.kind),
        text: m.text,
        avatar: currentUser?.avatar_url,
        name: currentUser?.full_name,
        status: m.status,
        time:
          m.status === 'sending' ? (
            <span className="stat" role="status">
              Sending…
            </span>
          ) : (
            <span className="stat" role="alert">
              <Icon name="alert" />
              Not sent. Check your connection.
              <button type="button" className="retry" onClick={() => retry(m.key)}>
                Retry
              </button>
            </span>
          ),
      })
    ),
  ];

  const composer = (
    <form className="composer" onSubmit={handleSend}>
      <button
        type="button"
        className="ptoggle"
        aria-pressed={prayerMode}
        onClick={() => setPrayerMode((v) => !v)}
      >
        <Icon name="heart" />
        Prayer Request
      </button>
      <label className="sr" htmlFor="msg-in">
        {prayerMode ? 'Write a prayer request' : 'Write a message'}
      </label>
      <input
        className="input"
        id="msg-in"
        autoComplete="off"
        value={messageText}
        onChange={(e) => setMessageText(e.target.value)}
        placeholder={prayerMode ? 'Share a prayer request…' : 'Write a message…'}
      />
      <button type="submit" className="btn send">
        <Icon name="send" />
        <span>Send</span>
      </button>
    </form>
  );

  const side = (
    <aside className="chat-side">
      <section className="card pad" aria-labelledby="mem-h">
        <h2 className="h3" id="mem-h">
          Members
        </h2>
        <ul className="people" style={{ marginTop: 8 }}>
          {members.map((x) => (
            <li key={x.user_id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="avatar" src={x.profile.avatar_url} width={40} height={40} alt="" />
              <div className="grow">
                <b className="trunc" style={{ display: 'block' }}>
                  {x.profile.full_name}
                  {x.user_id === meId && (
                    <>
                      {' '}
                      <span className="tag">You</span>
                    </>
                  )}
                </b>
                <span className="small trunc" style={{ display: 'block' }}>
                  {x.profile.headline}
                </span>
              </div>
            </li>
          ))}
          {pod && openSeats > 0 && (
            <li>
              <span className="seat" style={{ width: 40, height: 40 }}>
                <Icon name="plus" />
              </span>
              <span className="small">
                {openSeats} open seat{openSeats > 1 ? 's' : ''}
              </span>
            </li>
          )}
        </ul>
      </section>

      <section className="card pad" aria-labelledby="pg-h">
        <h2 className="h3 row" id="pg-h" style={{ gap: 8 }}>
          <Icon name="pin" />
          Prayer &amp; Goals
        </h2>
        <p className="small" style={{ margin: '2px 0 12px' }}>
          Pinned so nobody has to scroll back.
        </p>
        {boardError && (
          <div style={{ marginBottom: 12 }}>
            <AlertBox title={boardError.title} text={boardError.text} />
          </div>
        )}
        {pins.length ? (
          <ul className="board">
            {pins.map((b) => {
              const goal = b.pin_type === 'goal';
              const pressed = amened.has(b.id);
              const by =
                b.author_id === meId
                  ? 'You'
                  : firstName(b.author?.full_name || profileById.get(b.author_id)?.full_name);
              return (
                <li key={b.id} className={b.is_answered ? 'answered' : ''}>
                  <span className={`b-kind ${b.pin_type}`}>
                    <Icon name={goal ? 'target' : b.pin_type === 'resource' ? 'pin' : 'heart'} />
                    {goal ? 'Personal Goal' : b.pin_type === 'resource' ? 'Resource' : 'Prayer Request'}
                    {b.is_answered && (
                      <span className="tag ok">
                        <Icon name="check" />
                        {goal ? 'Done' : 'Answered'}
                      </span>
                    )}
                  </span>
                  <p className="b-text">{b.title}</p>
                  {b.body && <p className="small">{b.body}</p>}
                  <p className="small">{by}</p>
                  <div className="b-acts">
                    <button
                      type="button"
                      className={`mini${spark === b.id ? ' spark' : ''}`}
                      aria-pressed={pressed}
                      onClick={() => handleAmenPin(b.id)}
                    >
                      <Icon name="heart" className={pressed ? 'fill' : undefined} />
                      Amen<span aria-hidden="true">· {b.amen_count}</span>
                      <span className="sr">, {b.amen_count} so far</span>
                    </button>
                    {!b.is_answered && (
                      <button
                        type="button"
                        className="mini"
                        aria-busy={busyPin === b.id || undefined}
                        onClick={() => handleMarkAnswered(b)}
                      >
                        <Icon name="check" />
                        {goal ? 'Mark Done' : 'Mark Answered'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon="pin"
            title="Nothing Pinned Yet"
            text={`Add a prayer request or a goal so your ${pod ? 'pod' : 'friend'} can stand with you.`}
          />
        )}
        <form className="add-row" onSubmit={handleCreatePin}>
          <div className="seg" role="radiogroup" aria-label="What to add">
            {(
              [
                ['prayer', 'Prayer'],
                ['goal', 'Goal'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={boardType === t}
                onClick={() => setBoardType(t)}
              >
                <span className="radio" />
                {label}
              </button>
            ))}
          </div>
          <label className="sr" htmlFor="bd-in">
            Add to Prayer and Goals
          </label>
          <input
            className="input"
            id="bd-in"
            value={boardText}
            onChange={(e) => setBoardText(e.target.value)}
            placeholder={boardType === 'goal' ? 'Add a personal goal…' : 'Add a prayer request…'}
          />
          <Btn variant="btn-outline" type="submit" icon="pin" busy={savingPin} busyLabel="Pinning…">
            Pin to Board
          </Btn>
        </form>
      </section>
    </aside>
  );

  return shell(
    <main className={`chat ${pod ? 'pod' : 'duo'}`}>
      {head}
      <div className="wrap chat-body">
        <section className="card chat-main" aria-label="Messages">
          {starters}
          <ul className="msgs" role="log" aria-live="polite" ref={msgsRef}>
            {msgItems.length ? (
              msgItems
            ) : (
              <li>
                <Empty
                  icon="chat"
                  title="Say Hello"
                  text="This chat is new. Tap a conversation starter above or write your first message."
                />
              </li>
            )}
          </ul>
          <p className="sr" role="status">
            {sentNote}
          </p>
          {composer}
        </section>
        {side}
      </div>
    </main>
  );
}

export default function FellowshipRoomPage() {
  return (
    <React.Suspense
      fallback={
        <p className="empty" role="status">
          <Spinner />
          Connecting to room…
        </p>
      }
    >
      <FellowshipRoomContent />
    </React.Suspense>
  );
}

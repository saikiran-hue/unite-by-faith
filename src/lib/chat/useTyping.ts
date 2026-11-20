'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { activeTypers, shouldSendTyping, typerName, TYPING_TTL_MS, type TypingEvent } from './status';

const sameNames = (a: string[], b: string[]) => a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Typing indicator over a private broadcast channel. Realtime Authorization admits only room
 * members to `room:<id>`. Nothing is stored. A typer is named from the room's participant list by
 * user id, and events from anyone not in it are dropped, so a payload cannot choose the name shown.
 * Times are stamped when an event arrives, never taken from the payload, so other people's clock
 * skew cannot keep a name up or hide it early.
 *
 * `participants` is read through a ref: a new list on every room load must not resubscribe.
 */
export function useTyping(roomId: string, meId: string, participants: { user_id: string; name: string }[]) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const readyRef = useRef(false);
  const lastSentRef = useRef<number | null>(null);
  const namesRef = useRef<ReadonlyMap<string, string>>(new Map());
  const clearRef = useRef<(userId: string) => void>(() => {});

  useEffect(() => {
    namesRef.current = new Map(participants.map((p) => [p.user_id, p.name]));
  }, [participants]);

  useEffect(() => {
    if (!roomId || !meId) return;
    const supabase = createSupabaseBrowserClient();
    let closed = false;
    let events: TypingEvent[] = [];
    let tick: ReturnType<typeof setInterval> | null = null;

    const update = () => {
      const now = Date.now();
      events = events.filter((e) => now - e.at <= TYPING_TTL_MS);
      const names = activeTypers(events, meId, now);
      setTypingNames((prev) => (sameNames(prev, names) ? prev : names));
      if (names.length === 0 && tick) {
        clearInterval(tick);
        tick = null;
      }
    };

    clearRef.current = (userId) => {
      if (!events.some((e) => e.user_id === userId)) return;
      events = events.filter((e) => e.user_id !== userId);
      update();
    };

    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const userId = payload?.user_id;
        if (typeof userId !== 'string') return;
        const name = typerName(userId, namesRef.current);
        if (!name) return;
        events.push({ user_id: userId, name, at: Date.now() });
        update();
        if (!tick) tick = setInterval(update, 1000);
      });
    channelRef.current = channel;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (closed) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!closed) {
        channel.subscribe((status) => {
          readyRef.current = status === 'SUBSCRIBED';
        });
      }
    });

    return () => {
      closed = true;
      readyRef.current = false;
      channelRef.current = null;
      clearRef.current = () => {};
      if (tick) clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [roomId, meId]);

  /** Call on every keystroke; sends at most one event per TYPING_SEND_MS. */
  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    // Before SUBSCRIBED, send() would fall back to a REST call; skip instead.
    if (!channel || !readyRef.current || !meId) return;
    const now = Date.now();
    if (!shouldSendTyping(lastSentRef.current, now)) return;
    lastSentRef.current = now;
    // Only the id: receivers name the typer from their own participant list.
    void channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: meId } });
  }, [meId]);

  /** A new message from this person arrived, so their typing line ends with it. */
  const clearTyper = useCallback((userId: string) => clearRef.current(userId), []);

  return { typingNames, notifyTyping, clearTyper };
}

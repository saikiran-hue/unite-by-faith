'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ComputedDuoMatch,
  CurrentUser,
  DuoChat,
  FellowshipPod,
  TaxonomyTag,
} from '@/types/database';

/**
 * Client state for the home screen: loads /api/state (matches are scored
 * server-side against the user's saved habits), joins pods and opens 1v1 chats.
 */
interface StatePayload {
  currentUser: CurrentUser;
  taxonomyTags?: TaxonomyTag[];
  pods?: FellowshipPod[];
  duoMatches?: ComputedDuoMatch[];
  duoChats?: DuoChat[];
}

/** Fetches /api/state (matches scored against saved habits); null on failure. */
async function loadState(onSignedOut: () => void): Promise<StatePayload | null> {
  try {
    const res = await fetch('/api/state');
    if (res.status === 401) {
      onSignedOut();
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as StatePayload;
  } catch {
    return null;
  }
}

export function useAppState() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [taxonomyTags, setTaxonomyTags] = useState<TaxonomyTag[]>([]);
  const [pods, setPods] = useState<FellowshipPod[]>([]);
  const [duoMatches, setDuoMatches] = useState<ComputedDuoMatch[]>([]);
  const [duoChats, setDuoChats] = useState<DuoChat[]>([]);

  const [startingDuoId, setStartingDuoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Stores a loaded state payload; returns true when there was one. */
  const apply = useCallback((data: StatePayload | null): boolean => {
    if (data) {
      setCurrentUser(data.currentUser);
      setTaxonomyTags(data.taxonomyTags || []);
      setPods(data.pods || []);
      setDuoMatches(data.duoMatches || []);
      setDuoChats(data.duoChats || []);
    }
    setLoading(false);
    return Boolean(data);
  }, []);

  /** Reloads state; resolves true when fresh matches were loaded. */
  const signedOut = useCallback(() => router.replace('/auth'), [router]);
  const fetchState = useCallback(
    () => loadState(signedOut).then(apply),
    [apply, signedOut]
  );

  useEffect(() => {
    void loadState(signedOut).then(apply);
  }, [apply, signedOut]);

  const tagMap = useMemo(
    () => new Map(taxonomyTags.map((t) => [t.slug, t])),
    [taxonomyTags]
  );

  const userTagSet = useMemo(
    () => new Set((currentUser?.tags || []).map((t) => t.tag_slug)),
    [currentUser]
  );

  async function startDuoChat(match: ComputedDuoMatch) {
    setActionError(null);
    if (match.existing_chat_room_id) {
      router.push(`/rooms/${match.existing_chat_room_id}`);
      return;
    }

    setStartingDuoId(match.partner.id);
    try {
      const res = await fetch('/api/duos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: match.partner.id,
          sharedTags: match.shared_tags,
          similarityScore: match.similarity_score,
        }),
      });
      if (res.status === 401) {
        router.replace('/auth');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Couldn't open the 1v1 chat. Try again.");
        return;
      }
      router.push(`/rooms/${data.chat_room_id}`);
    } catch {
      setActionError("Couldn't open the 1v1 chat. Check your connection and try again.");
    } finally {
      setStartingDuoId(null);
    }
  }

  return {
    loading,
    currentUser,
    taxonomyTags,
    pods,
    duoMatches,
    duoChats,
    tagMap,
    userTagSet,
    startingDuoId,
    actionError,
    setActionError,
    startDuoChat,
    refresh: fetchState,
  };
}

export type AppState = ReturnType<typeof useAppState>;

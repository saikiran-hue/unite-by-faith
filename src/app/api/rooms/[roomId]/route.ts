import { after, NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { recordMessageOutcomes } from '@/lib/matching/outcomes';
import { isRoomMember } from '@/lib/rooms';
import { PUBLIC_CARD_COLUMNS, TAXONOMY_COLUMNS } from '@/lib/taxonomy';
import { readJsonObject } from '@/lib/request';
import { buildContextualIcebreakers } from '@/lib/matching/engine';
import {
  ChatMessage,
  RoomPin,
  TaxonomyTag,
  UserProfile,
  UserTag,
} from '@/types/database';

const MESSAGE_LIMIT = 200;
const SENDABLE_TYPES = ['text', 'prayer_request', 'icebreaker'];

type Card = Pick<UserProfile, 'id' | 'full_name' | 'display_handle' | 'avatar_url' | 'headline'>;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    const { data: room, error: roomErr } = await admin
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();
    if (roomErr || !room) {
      return NextResponse.json(
        { error: roomErr?.message || 'Chat room not found' },
        { status: 404 }
      );
    }
    if (!(await isRoomMember(admin, room, userId))) {
      return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
    }

    // Only this room and its people: whole-table reads hit the 1000-row cap.
    const [
      { data: taxonomyRows },
      { data: profileRow },
      { data: userTagRows },
      { data: messageRows },
      { data: pinRows },
    ] = await Promise.all([
      admin
        .from('taxonomy_tags')
        .select(TAXONOMY_COLUMNS)
        .order('sort_order', { ascending: true }),
      admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
      admin.from('user_tags').select('*').eq('user_id', userId),
      // The latest messages, newest first here and reversed for display below.
      admin
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_LIMIT),
      admin
        .from('room_pins')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT),
    ]);

    if (!profileRow) {
      return NextResponse.json({ error: 'signed_out' }, { status: 401 });
    }
    const currentUser: UserProfile = {
      ...profileRow,
      tags: (userTagRows || []) as UserTag[],
    };
    const taxonomyTags = (taxonomyRows || []) as TaxonomyTag[];
    const messages = (messageRows || []).reverse();
    const pins = pinRows || [];

    let podDetails = null;
    let participantRows: { user_id: string; role: string }[] = [];
    let duoSimilarityScore: number | null = null;

    if (room.room_type === 'pod_group') {
      const { data: pod } = await admin
        .from('pods')
        .select('*')
        .eq('chat_room_id', roomId)
        .single();

      if (pod) {
        podDetails = pod;
        const { data: pmRows } = await admin
          .from('pod_members')
          .select('user_id, role')
          .eq('pod_id', pod.id)
          .order('joined_at', { ascending: true });
        participantRows = pmRows || [];
      }
    } else {
      const { data: duo } = await admin
        .from('duo_matches')
        .select('user_a_id, user_b_id, similarity_score')
        .eq('chat_room_id', roomId)
        .single();

      if (duo) {
        duoSimilarityScore =
          duo.similarity_score === null ? null : Number(duo.similarity_score);
        participantRows = [
          { user_id: duo.user_a_id, role: 'duo_partner' },
          { user_id: duo.user_b_id, role: 'duo_partner' },
        ];
      }
    }

    // Public cards for participants, message senders and pin authors (a sender may have left).
    const cardIds = [
      ...new Set([
        ...participantRows.map((p) => p.user_id),
        ...messages.map((m) => m.sender_id as string),
        ...pins.map((p) => p.author_id as string),
      ]),
    ];
    const cardMap = new Map<string, Card>();
    if (cardIds.length > 0) {
      const { data: cards } = await admin
        .from('profiles')
        .select(PUBLIC_CARD_COLUMNS)
        .in('id', cardIds);
      for (const c of (cards || []) as Card[]) cardMap.set(c.id, c);
    }

    const participants = participantRows.flatMap((p) => {
      const profile = cardMap.get(p.user_id);
      return profile ? [{ user_id: p.user_id, role: p.role, profile }] : [];
    });

    const hydratedMessages: ChatMessage[] = messages.map((m) => ({
      ...m,
      sender: cardMap.get(m.sender_id),
    }));

    const hydratedPins: RoomPin[] = pins.map((pin) => {
      const author = cardMap.get(pin.author_id);
      return {
        ...pin,
        author: author
          ? { id: author.id, full_name: author.full_name, avatar_url: author.avatar_url }
          : undefined,
      };
    });

    const contextualIcebreakers = buildContextualIcebreakers(
      room.shared_tags || [],
      room.room_type,
      taxonomyTags
    );

    return NextResponse.json({
      room,
      currentUser,
      taxonomyTags,
      podDetails,
      duoSimilarityScore,
      participants,
      messages: hydratedMessages,
      pins: hydratedPins,
      contextualIcebreakers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const senderId = userId;
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const { data: room } = await admin
      .from('chat_rooms')
      .select('id, room_type')
      .eq('id', roomId)
      .maybeSingle();
    if (!room) {
      return NextResponse.json({ error: 'Chat room not found' }, { status: 404 });
    }
    if (!(await isRoomMember(admin, room, userId))) {
      return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
    }

    if (body.action === 'message') {
      const content = String(body.content || '').trim();
      // People post text, prayer requests and (from a Conversation Starter) icebreakers.
      // Milestones are written by the app only.
      const messageType = String(body.messageType ?? 'text');
      if (!SENDABLE_TYPES.includes(messageType)) {
        return NextResponse.json({ error: 'Invalid messageType' }, { status: 400 });
      }

      if (!content) {
        return NextResponse.json(
          { error: 'Message content cannot be empty' },
          { status: 400 }
        );
      }

      const { data: msg, error } = await admin
        .from('chat_messages')
        .insert({
          room_id: roomId,
          sender_id: senderId,
          message_type: messageType,
          content,
          metadata: body.metadata || {},
        })
        .select('*')
        .single();

      if (error || !msg) {
        return NextResponse.json(
          { error: error?.message || 'Failed to send message' },
          { status: 500 }
        );
      }

      await admin
        .from('chat_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', roomId);

      after(() =>
        recordMessageOutcomes(admin, roomId, msg.id, senderId, messageType, new Date())
      );

      return NextResponse.json({ message: msg });
    }

    if (body.action === 'create_pin') {
      const title = String(body.title || '').trim();
      const pinBody = String(body.body || '').trim();
      const pinType =
        body.pinType === 'goal' || body.pinType === 'resource'
          ? body.pinType
          : 'prayer';

      if (!title) {
        return NextResponse.json(
          { error: 'Pin title is required' },
          { status: 400 }
        );
      }

      const { data: pin, error: pinErr } = await admin
        .from('room_pins')
        .insert({
          room_id: roomId,
          author_id: senderId,
          pin_type: pinType,
          title,
          body: pinBody,
          amen_count: 1,
          is_answered: false,
        })
        .select('*')
        .single();

      if (pinErr || !pin) {
        return NextResponse.json(
          { error: pinErr?.message || 'Failed to create pin' },
          { status: 500 }
        );
      }

      // Also broadcast a prayer/goal message into the room stream
      const { data: broadcast } = await admin.from('chat_messages').insert({
        room_id: roomId,
        sender_id: senderId,
        message_type: pinType === 'prayer' ? 'prayer_request' : 'milestone',
        content:
          pinType === 'prayer'
            ? `🙏 Shared Prayer Request: "${title}"${pinBody ? ` — ${pinBody}` : ''}`
            : `🎯 Shared Fellowship Goal: "${title}"${pinBody ? ` — ${pinBody}` : ''}`,
        metadata: { pin_id: pin.id, pin_type: pinType },
      }).select('id, message_type').single();

      // A prayer request is a person's message, so it can earn replied / active_7d.
      if (broadcast) {
        after(() =>
          recordMessageOutcomes(admin, roomId, broadcast.id, senderId, broadcast.message_type, new Date())
        );
      }

      return NextResponse.json({ pin });
    }

    if (body.action === 'amen_pin') {
      const pinId = String(body.pinId || '');
      const { data: existing } = await admin
        .from('room_pins')
        .select('amen_count')
        .eq('id', pinId)
        .eq('room_id', roomId)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: 'pin_not_found' }, { status: 404 });
      }

      const nextCount = (existing.amen_count || 1) + 1;
      const { data: updated, error } = await admin
        .from('room_pins')
        .update({ amen_count: nextCount })
        .eq('id', pinId)
        .eq('room_id', roomId)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ pin: updated });
    }

    if (body.action === 'toggle_answered') {
      const pinId = String(body.pinId || '');
      const { data: existing } = await admin
        .from('room_pins')
        .select('is_answered')
        .eq('id', pinId)
        .eq('room_id', roomId)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: 'pin_not_found' }, { status: 404 });
      }

      const { data: updated, error } = await admin
        .from('room_pins')
        .update({ is_answered: !existing.is_answered })
        .eq('id', pinId)
        .eq('room_id', roomId)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ pin: updated });
    }

    return NextResponse.json({ error: 'Invalid room action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

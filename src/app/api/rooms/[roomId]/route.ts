import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { buildContextualIcebreakers } from '@/lib/matching/engine';
import {
  ChatMessage,
  RoomPin,
  TaxonomyTag,
  UserProfile,
  UserTag,
} from '@/types/database';

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

    const [
      { data: room, error: roomErr },
      { data: taxonomyRows },
      { data: profileRows },
      { data: userTagRows },
      { data: messageRows },
      { data: pinRows },
    ] = await Promise.all([
      admin.from('chat_rooms').select('*').eq('id', roomId).single(),
      admin
        .from('taxonomy_tags')
        .select('*')
        .order('sort_order', { ascending: true }),
      admin.from('profiles').select('*'),
      admin.from('user_tags').select('*'),
      admin
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true }),
      admin
        .from('room_pins')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false }),
    ]);

    if (roomErr || !room) {
      return NextResponse.json(
        { error: roomErr?.message || 'Chat room not found' },
        { status: 404 }
      );
    }

    const taxonomyTags = (taxonomyRows || []) as TaxonomyTag[];

    const tagsByUser = new Map<string, UserTag[]>();
    for (const ut of (userTagRows || []) as UserTag[]) {
      const list = tagsByUser.get(ut.user_id) || [];
      list.push(ut);
      tagsByUser.set(ut.user_id, list);
    }

    const allProfiles: UserProfile[] = (profileRows || []).map((p) => ({
      ...p,
      tags: tagsByUser.get(p.id) || [],
    }));
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

    const currentUser = profileMap.get(userId);
    if (!currentUser) {
      return NextResponse.json({ error: 'signed_out' }, { status: 401 });
    }

    let podDetails = null;
    let participants: {
      user_id: string;
      role: string;
      profile: UserProfile;
    }[] = [];
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
          .select('*')
          .eq('pod_id', pod.id)
          .order('joined_at', { ascending: true });

        participants = (pmRows || [])
          .map((pm) => {
            const prof = profileMap.get(pm.user_id);
            return prof
              ? { user_id: pm.user_id, role: pm.role, profile: prof }
              : null;
          })
          .filter(Boolean) as {
          user_id: string;
          role: string;
          profile: UserProfile;
        }[];
      }
    } else {
      const { data: duo } = await admin
        .from('duo_matches')
        .select('*')
        .eq('chat_room_id', roomId)
        .single();

      if (duo) {
        duoSimilarityScore = Number(duo.similarity_score || 92);
        const pA = profileMap.get(duo.user_a_id);
        const pB = profileMap.get(duo.user_b_id);
        if (pA)
          participants.push({
            user_id: pA.id,
            role: 'duo_partner',
            profile: pA,
          });
        if (pB)
          participants.push({
            user_id: pB.id,
            role: 'duo_partner',
            profile: pB,
          });
      }
    }

    const hydratedMessages: ChatMessage[] = (messageRows || []).map((m) => {
      const senderProf = profileMap.get(m.sender_id);
      return {
        ...m,
        sender: senderProf
          ? {
              id: senderProf.id,
              full_name: senderProf.full_name,
              display_handle: senderProf.display_handle,
              avatar_url: senderProf.avatar_url,
              headline: senderProf.headline,
            }
          : undefined,
      };
    });

    const hydratedPins: RoomPin[] = (pinRows || []).map((pin) => {
      const authorProf = profileMap.get(pin.author_id);
      return {
        ...pin,
        author: authorProf
          ? {
              id: authorProf.id,
              full_name: authorProf.full_name,
              avatar_url: authorProf.avatar_url,
            }
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
      allProfiles,
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
    const body = await req.json();
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const senderId = userId;

    if (body.action === 'message') {
      const content = String(body.content || '').trim();
      const messageType =
        body.messageType === 'icebreaker' ||
        body.messageType === 'prayer_request' ||
        body.messageType === 'milestone'
          ? body.messageType
          : 'text';

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
      await admin.from('chat_messages').insert({
        room_id: roomId,
        sender_id: senderId,
        message_type: pinType === 'prayer' ? 'prayer_request' : 'milestone',
        content:
          pinType === 'prayer'
            ? `🙏 Shared Prayer Request: "${title}"${pinBody ? ` — ${pinBody}` : ''}`
            : `🎯 Shared Fellowship Goal: "${title}"${pinBody ? ` — ${pinBody}` : ''}`,
        metadata: { pin_id: pin.id, pin_type: pinType },
      });

      return NextResponse.json({ pin });
    }

    if (body.action === 'amen_pin') {
      const pinId = String(body.pinId || '');
      const { data: existing } = await admin
        .from('room_pins')
        .select('amen_count')
        .eq('id', pinId)
        .single();

      const nextCount = (existing?.amen_count || 1) + 1;
      const { data: updated, error } = await admin
        .from('room_pins')
        .update({ amen_count: nextCount })
        .eq('id', pinId)
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
        .single();

      const { data: updated, error } = await admin
        .from('room_pins')
        .update({ is_answered: !existing?.is_answered })
        .eq('id', pinId)
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

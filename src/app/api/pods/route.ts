import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createSupabaseAdminClient();
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;

    if (body.action === 'join') {
      const podId = String(body.podId || '');
      if (!podId) {
        return NextResponse.json(
          { error: 'podId is required' },
          { status: 400 }
        );
      }

      const { data, error } = await admin.rpc('join_pod_atomic', {
        p_pod_id: podId,
        p_user_id: userId,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(data);
    }

    if (body.action === 'create') {
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const meetingCadence = String(
        body.meetingCadence || 'Weekly Huddle + Daily Async Chat'
      ).trim();
      const maxMembers = body.maxMembers === 3 ? 3 : 4;
      const anchorTags: string[] = Array.isArray(body.anchorTags)
        ? body.anchorTags.slice(0, 5)
        : ['daily-bible-study', 'small-group-fellowship'];

      if (!title || !description) {
        return NextResponse.json(
          { error: 'Pod title and description are required' },
          { status: 400 }
        );
      }

      const tagSummary = anchorTags
        .map((s) => s.replace(/-/g, ' '))
        .join(', ');
      const icebreaker = `Small Pod Icebreaker (3-4 Circle): Welcome to "${title}"! Everyone in this circle shares a heart for ${tagSummary}. Share a quick intro, what you are building or learning right now, and how we can pray for you this week!`;

      const { data: room, error: roomErr } = await admin
        .from('chat_rooms')
        .insert({
          room_type: 'pod_group',
          title,
          subtitle: `3–${maxMembers} Member Fellowship Pod • ${meetingCadence}`,
          shared_tags: anchorTags,
          active_icebreaker: icebreaker,
        })
        .select('*')
        .single();

      if (roomErr || !room) {
        return NextResponse.json(
          { error: roomErr?.message || 'Failed to create pod room' },
          { status: 500 }
        );
      }

      const { data: pod, error: podErr } = await admin
        .from('pods')
        .insert({
          chat_room_id: room.id,
          title,
          description,
          focus_pillar: 'faith_and_skills',
          anchor_tags: anchorTags,
          min_members: 3,
          max_members: maxMembers,
          member_count: 1,
          meeting_cadence: meetingCadence,
          status: 'forming',
          created_by: userId,
        })
        .select('*')
        .single();

      if (podErr || !pod) {
        return NextResponse.json(
          { error: podErr?.message || 'Failed to create pod' },
          { status: 500 }
        );
      }

      await admin.from('pod_members').insert({
        pod_id: pod.id,
        user_id: userId,
        role: 'facilitator',
      });

      await admin.from('chat_messages').insert({
        room_id: room.id,
        sender_id: userId,
        message_type: 'icebreaker',
        content: icebreaker,
        metadata: { pod_id: pod.id, anchor_tags: anchorTags },
      });

      return NextResponse.json({
        status: 'created',
        pod_id: pod.id,
        chat_room_id: room.id,
      });
    }

    return NextResponse.json({ error: 'Invalid pod action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    );
  }
}

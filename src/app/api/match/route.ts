import { after, NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUserId } from '@/lib/session';
import { loadPeople, loadScoreContext, loadViewerLifeFit, type LoadedPerson } from '@/lib/matching/load';
import { rankDuos, rankPods } from '@/lib/matching/rank';
import type { PairScore } from '@/lib/matching/score';

const RULE_ORDER = ['age', 'language', 'place', 'gender', 'tradition'];

const scoreFields = (s: PairScore) => ({
  score: s.score,
  breakdown: s.breakdown,
  reasons: s.reasons,
  weightsVersion: s.weightsVersion,
});

export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get('kind');
    if (kind !== 'duo' && kind !== 'pods') {
      return NextResponse.json({ error: "kind must be 'duo' or 'pods'" }, { status: 400 });
    }
    const auth = await requireUserId();
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    const admin = createSupabaseAdminClient();

    const missing = await loadViewerLifeFit(admin, userId);
    if (missing.length > 0) {
      return NextResponse.json({ code: 'life_fit_incomplete', missing }, { status: 409 });
    }
    const viewer = (await loadPeople(admin, [userId])).get(userId);
    if (!viewer) {
      return NextResponse.json({ code: 'life_fit_incomplete', missing: [] }, { status: 409 });
    }

    let results: Record<string, unknown>[] = [];
    let events: { target_id: string; score: number; breakdown: PairScore['breakdown']; weights_version: number }[] = [];

    if (kind === 'duo') {
      const { data, error } = await admin.rpc('match_candidates', { viewer: userId, kind: 'duo', lim: 300 });
      if (error) throw new Error(`match_candidates: ${error.message}`);
      const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
      const people = await loadPeople(admin, ids);
      const slugs = [...viewer.match.tags, ...[...people.values()].flatMap((p) => p.match.tags)].map((t) => t.slug);
      const { ctx, labels } = await loadScoreContext(admin, slugs, viewer.match.isDemo);
      const ranked = rankDuos(viewer.match, [...people.values()].map((p) => p.match), ctx, 20);

      const rooms = new Map<string, string>();
      if (ranked.length > 0) {
        const top = ranked.map((r) => r.userId);
        const [a, b] = await Promise.all([
          admin.from('duo_matches').select('user_b_id, chat_room_id').eq('user_a_id', userId).in('user_b_id', top),
          admin.from('duo_matches').select('user_a_id, chat_room_id').eq('user_b_id', userId).in('user_a_id', top),
        ]);
        for (const r of (a.data ?? []) as { user_b_id: string; chat_room_id: string | null }[]) {
          if (r.chat_room_id) rooms.set(r.user_b_id, r.chat_room_id);
        }
        for (const r of (b.data ?? []) as { user_a_id: string; chat_room_id: string | null }[]) {
          if (r.chat_room_id) rooms.set(r.user_a_id, r.chat_room_id);
        }
      }
      results = ranked.map((r) => ({
        partner: (people.get(r.userId) as LoadedPerson).pub,
        existing_chat_room_id: rooms.get(r.userId) ?? null,
        ...scoreFields(r),
      }));
      events = ranked.map((r) => ({ target_id: r.userId, score: r.score, breakdown: r.breakdown, weights_version: r.weightsVersion }));
      return await respond(kind, results, events, labels);
    }

    // kind === 'pods'
    const { data, error } = await admin.rpc('match_pod_candidates', { viewer: userId, lim: 100 });
    if (error) throw new Error(`match_pod_candidates: ${error.message}`);
    const podIds = ((data ?? []) as { pod_id: string }[]).map((r) => r.pod_id);
    const [podRes, memRes] = podIds.length
      ? await Promise.all([
          admin
            .from('pods')
            .select('id, chat_room_id, title, description, focus_pillar, anchor_tags, min_members, max_members, member_count, meeting_cadence, status, created_at')
            .in('id', podIds),
          admin.from('pod_members').select('pod_id, user_id, role, joined_at').in('pod_id', podIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (podRes.error) throw new Error(`pods: ${podRes.error.message}`);
    if (memRes.error) throw new Error(`pod_members: ${memRes.error.message}`);
    const pods = (podRes.data ?? []) as {
      id: string; chat_room_id: string; title: string; description: string; focus_pillar: string; anchor_tags: string[];
      min_members: number; max_members: number; member_count: number; meeting_cadence: string; status: string; created_at: string;
    }[];
    const members = (memRes.data ?? []) as { pod_id: string; user_id: string; role: string; joined_at: string }[];
    const people = await loadPeople(admin, [...new Set(members.map((m) => m.user_id))]);
    const slugs = [
      ...viewer.match.tags.map((t) => t.slug),
      ...[...people.values()].flatMap((p) => p.match.tags.map((t) => t.slug)),
      ...pods.flatMap((p) => p.anchor_tags),
    ];
    const { ctx, labels } = await loadScoreContext(admin, slugs, viewer.match.isDemo);

    const podById = new Map(pods.map((p) => [p.id, p]));
    const membersOf = (podId: string) => members.filter((m) => m.pod_id === podId);
    const ranked = rankPods(
      viewer.match,
      pods.map((p) => ({
        podId: p.id,
        members: membersOf(p.id).map((m) => people.get(m.user_id)?.match).filter((x): x is NonNullable<typeof x> => !!x),
        anchorTags: p.anchor_tags,
      })),
      ctx,
      20,
    );
    results = ranked.map((r) => {
      const p = podById.get(r.podId)!;
      return {
        id: p.id,
        chat_room_id: p.chat_room_id,
        title: p.title,
        description: p.description,
        focus_pillar: p.focus_pillar,
        anchor_tags: p.anchor_tags,
        min_members: p.min_members,
        max_members: p.max_members,
        member_count: p.member_count,
        meeting_cadence: p.meeting_cadence,
        status: p.status,
        created_at: p.created_at,
        is_joined: false,
        members: membersOf(p.id).flatMap((m) => {
          const person = people.get(m.user_id);
          if (!person) return [];
          const { id, full_name, display_handle, avatar_url, headline } = person.pub;
          return [{ user_id: m.user_id, role: m.role, joined_at: m.joined_at, profile: { id, full_name, display_handle, avatar_url, headline } }];
        }),
        ...scoreFields(r),
      };
    });
    events = ranked.map((r) => ({ target_id: r.podId, score: r.score, breakdown: r.breakdown, weights_version: r.weightsVersion }));
    return await respond(kind, results, events, labels);

    async function respond(
      k: 'duo' | 'pods',
      res: Record<string, unknown>[],
      evs: typeof events,
      labelMap: Map<string, string>,
    ) {
      const body: Record<string, unknown> = { kind: k, results: res, tag_labels: Object.fromEntries(labelMap) };
      if (res.length === 0) {
        const { data: counts, error: cErr } = await admin.rpc('match_filter_counts', { viewer: userId, kind: k });
        if (cErr) {
          console.error(`match_filter_counts failed: ${cErr.message}`);
        } else {
          const rows = (counts ?? []) as { rule: string; passing: number }[];
          rows.sort((a, b) => a.passing - b.passing || RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule));
          if (rows[0]) body.emptyReason = { rule: rows[0].rule, passing: rows[0].passing };
        }
      }
      if (evs.length > 0) {
        after(async () => {
          try {
            const { error: insErr } = await admin.from('match_events').insert(
              evs.map((e) => ({ viewer_id: userId, kind: k === 'duo' ? 'duo' : 'pod', event: 'shown', ...e })),
            );
            if (insErr) console.error(`match_events insert failed: ${insErr.message}`);
          } catch (e) {
            console.error('match_events insert failed', e);
          }
        });
      }
      return NextResponse.json(body);
    }
  } catch (err) {
    console.error('GET /api/match failed', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

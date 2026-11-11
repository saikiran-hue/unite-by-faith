export type PillarCategory = 'faith' | 'skills' | 'hobbies' | 'tastes';

export type FellowshipMode = 'both' | 'group_only' | 'duo_only';

export interface TaxonomyTag {
  slug: string;
  label: string;
  category: PillarCategory;
  description: string;
  icon_name: string;
  sort_order: number;
}

export interface UserTag {
  user_id: string;
  tag_slug: string;
  category: PillarCategory;
  is_priority: boolean;
}

export interface UserProfile {
  id: string;
  full_name: string;
  display_handle: string;
  avatar_url: string;
  headline: string;
  bio: string;
  denomination_or_tradition: string;
  church_or_fellowship: string;
  location_city: string;
  location_timezone: string;
  years_in_faith: string;
  fellowship_mode: FellowshipMode;
  onboarding_completed: boolean;
  is_demo_account: boolean;
  last_active_at: string;
  created_at: string;
  tags: UserTag[];
}

export interface PodMemberProfile {
  pod_id: string;
  user_id: string;
  role: 'member' | 'facilitator';
  joined_at: string;
  profile: UserProfile;
}

export interface FellowshipPod {
  id: string;
  chat_room_id: string;
  title: string;
  description: string;
  focus_pillar: string;
  anchor_tags: string[];
  min_members: number;
  max_members: number;
  member_count: number;
  meeting_cadence: string;
  status: 'forming' | 'active' | 'full' | 'archived';
  created_by: string | null;
  created_at: string;
  members: PodMemberProfile[];
  affinity_score: number;
  overlapping_tags: string[];
  is_joined: boolean;
}

export interface PillarBreakdown {
  faith: { score: number; shared: string[] };
  skills: { score: number; shared: string[] };
  hobbies: { score: number; shared: string[] };
  tastes: { score: number; shared: string[] };
}

export interface ComputedDuoMatch {
  partner: UserProfile;
  similarity_score: number;
  shared_tags: string[];
  priority_hits: string[];
  pillar_breakdown: PillarBreakdown;
  match_headline: string;
  suggested_icebreaker: string;
  existing_chat_room_id: string | null;
}

export interface ChatRoom {
  id: string;
  room_type: 'pod_group' | 'duo_1v1';
  title: string;
  subtitle: string;
  shared_tags: string[];
  active_icebreaker: string;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  message_type: 'text' | 'icebreaker' | 'prayer_request' | 'milestone';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  sender?: {
    id: string;
    full_name: string;
    display_handle: string;
    avatar_url: string;
    headline: string;
  };
}

export interface RoomPin {
  id: string;
  room_id: string;
  author_id: string;
  pin_type: 'prayer' | 'goal' | 'resource';
  title: string;
  body: string;
  amen_count: number;
  is_answered: boolean;
  created_at: string;
  author?: {
    id: string;
    full_name: string;
    avatar_url: string;
  };
}

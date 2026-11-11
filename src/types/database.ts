export type PillarCategory = 'faith' | 'skills' | 'hobbies' | 'tastes';

export type FellowshipMode = 'both' | 'group_only' | 'duo_only';

export type Level = 1 | 2 | 3;
export type MeetMode = 'in_person' | 'online' | 'both';
export type LifeStage =
  | 'student'
  | 'early_career'
  | 'established_career'
  | 'married_no_kids'
  | 'parent_young_kids'
  | 'parent_older_kids';
export type FaithStage = 'exploring' | 'new_believer' | 'growing' | 'mature';
export type Slot =
  | 'weekday_morning'
  | 'weekday_afternoon'
  | 'weekday_evening'
  | 'weekend_morning'
  | 'weekend_afternoon'
  | 'weekend_evening';

export interface TaxonomyTag {
  slug: string;
  label: string;
  category: PillarCategory;
  description: string;
  icon_name: string;
  sort_order: number;
  subgroup?: string;
  synonyms?: string[];
  popularity?: number;
  is_active?: boolean;
}

export interface Tradition {
  id: string;
  name: string;
  family: string;
  sort_order: number;
}

export interface City {
  id: number;
  name: string;
  country_code: string;
}

export interface UserTag {
  user_id: string;
  tag_slug: string;
  category: PillarCategory;
  is_priority: boolean;
  level?: Level;
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
  languages?: string[];
  location_city_id?: number | null;
  meet_mode?: MeetMode;
  life_stage?: LifeStage | null;
  availability?: Slot[];
  tradition_id?: string | null;
  faith_stage?: FaithStage | null;
  onboarding_completed: boolean;
  is_demo_account: boolean;
  last_active_at: string;
  created_at: string;
  tags: UserTag[];
}

export interface ProfilePrivate {
  user_id: string;
  birth_date: string | null;
  gender: 'man' | 'woman' | null;
  age_min: number | null;
  age_max: number | null;
  max_distance_km: number;
  only_my_tradition: boolean;
}

/** The signed-in viewer: their public profile plus their own private row (or null). */
export interface CurrentUser extends UserProfile {
  private: ProfilePrivate | null;
}

export interface DuoChat {
  partner: UserProfile;
  chat_room_id: string;
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

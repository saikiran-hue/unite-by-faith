const AVATAR_POOL = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
];

/** Starting `profiles` row for a new member. Onboarding replaces the placeholder text. */
export function newProfileRow(id: string, fullName: string, avatarUrl?: string | null) {
  const name = fullName.trim() || 'New Member';
  const handleBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 18);
  return {
    id,
    full_name: name,
    display_handle: `${handleBase || 'believer'}_${Math.floor(100 + Math.random() * 899)}`,
    avatar_url: avatarUrl || AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)],
    headline: 'Christian Friend & Community Builder',
    bio: 'Excited to connect in 3–4 member fellowship pods and 1v1 matches!',
    denomination_or_tradition: 'Non-Denominational',
    church_or_fellowship: '',
    location_city: 'Bengaluru, IN',
    location_timezone: 'Asia/Kolkata',
    years_in_faith: 'Growing Believer',
    fellowship_mode: 'both',
    onboarding_completed: false,
    is_demo_account: false,
  };
}

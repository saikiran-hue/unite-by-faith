-- ============================================================================
-- UNITE BY FAITH — PRODUCTION TAXONOMY & INITIAL COMMUNITY SEED MIGRATION
-- Populates 4-Pillar Taxonomy, Seed Believers, 3-4 Member Pods & Rooms
-- ============================================================================

-- 1. SEED 4-PILLAR TAXONOMY TAGS
insert into public.taxonomy_tags (slug, label, category, description, icon_name, sort_order)
values
  -- PILLAR 1: FAITH & SPIRITUAL RHYTHM
  ('daily-bible-study', 'Daily Bible Study', 'faith', 'Inductive scripture reading & chapter-by-chapter study', 'BookOpen', 1),
  ('prayer-intercession', 'Prayer & Intercession', 'faith', 'Dedicated prayer partners & weekly intercession rhythms', 'HeartHandshake', 2),
  ('christian-apologetics', 'Christian Apologetics', 'faith', 'Defending the faith through reason, science & history', 'ShieldCheck', 3),
  ('worship-ministry', 'Worship & Music Ministry', 'faith', 'Leading worship, songwriting & choir/band fellowship', 'Music', 4),
  ('faith-and-work', 'Faith & Work Integration', 'faith', 'Living out Kingdom values in tech, business & career', 'Briefcase', 5),
  ('discipleship-mentoring', 'Discipleship & Mentoring', 'faith', 'Iron-sharpens-iron spiritual accountability & growth', 'Users', 6),
  ('missions-outreach', 'Missions & Community Outreach', 'faith', 'Local volunteering, compassion ministry & global missions', 'Globe', 7),
  ('theology-history', 'Theology & Church History', 'faith', 'Deep dives into doctrine, patristics & confessions', 'ScrollText', 8),
  ('small-group-fellowship', 'Small Group Fellowship', 'faith', 'Warm home-style small circles & life-on-life sharing', 'Flame', 9),
  ('devotional-journaling', 'Devotional & Journaling', 'faith', 'Reflective morning devotionals, gratitude & lectio divina', 'Feather', 10),

  -- PILLAR 2: TECH, AI/ML & PROFESSIONAL SKILLS
  ('ai-engineering', 'AI Engineering & Agents', 'skills', 'Building with LLMs, RAG, agentic workflows & AI systems', 'Cpu', 11),
  ('machine-learning', 'Machine Learning (AI/ML)', 'skills', 'Deep learning, model training, PyTorch & applied ML', 'BrainCircuit', 12),
  ('fullstack-dev', 'Full-Stack Development', 'skills', 'TypeScript, Next.js, React, Node.js & modern web apps', 'Code2', 13),
  ('cloud-devops', 'Cloud & Systems Architecture', 'skills', 'AWS, GCP, Kubernetes, Postgres & scalable infra', 'Cloud', 14),
  ('data-science', 'Data Science & Analytics', 'skills', 'Data engineering, SQL, visualization & statistical modeling', 'BarChart3', 15),
  ('product-design', 'UI/UX & Product Design', 'skills', 'Figma, design systems, user research & craft', 'Palette', 16),
  ('saas-entrepreneurship', 'SaaS & Entrepreneurship', 'skills', 'Startups, indie hacking, product strategy & leadership', 'Rocket', 17),
  ('mobile-app-dev', 'Mobile App Engineering', 'skills', 'iOS, Android, React Native & cross-platform apps', 'Smartphone', 18),
  ('cybersecurity', 'Cybersecurity & Privacy', 'skills', 'Application security, ethical hacking & zero-trust systems', 'Lock', 19),
  ('learning-to-code', 'Learning Tech & Coding', 'skills', 'Growing in programming, CS fundamentals & career transitions', 'GraduationCap', 20),

  -- PILLAR 3: HOBBIES & ACTIVE LIFESTYLE
  ('acoustic-guitar', 'Acoustic Guitar & Instruments', 'hobbies', 'Playing guitar, piano, jamming & songwriting together', 'Guitar', 21),
  ('running-marathon', 'Running & Endurance', 'hobbies', 'Morning 5Ks, marathon training & outdoor fitness', 'Footprints', 22),
  ('strength-fitness', 'Gym & Functional Fitness', 'hobbies', 'Strength training, calisthenics & healthy stewardship', 'Dumbbell', 23),
  ('hiking-outdoors', 'Hiking & Nature Trails', 'hobbies', 'Weekend treks, camping & exploring creation', 'Mountain', 24),
  ('board-games-chess', 'Chess & Strategy Board Games', 'hobbies', 'Catan, chess matches & tabletop game nights', 'Trophy', 25),
  ('photography-film', 'Photography & Visual Storytelling', 'hobbies', 'Street photography, cinematography & editing', 'Camera', 26),
  ('cooking-baking', 'Cooking & Hospitality', 'hobbies', 'Sourdough baking, global cuisines & hosting dinners', 'Utensils', 27),
  ('reading-books', 'Book Club & Literature', 'hobbies', 'C.S. Lewis, Tim Keller, biographies & classic fiction', 'Library', 28),
  ('racquet-sports', 'Badminton, Tennis & Pickleball', 'hobbies', 'Friendly court matches & weekend sports meetups', 'Activity', 29),
  ('travel-culture', 'Travel & Cultural Exploration', 'hobbies', 'Backpacking, heritage trips & meeting global believers', 'Compass', 30),

  -- PILLAR 4: TASTES, CULTURE & FELLOWSHIP VIBE
  ('indie-worship', 'Indie & Acoustic Worship', 'tastes', 'Rivers & Robots, Kings Kaleidoscope, Maverick City & folk worship', 'Headphones', 31),
  ('lofi-deep-focus', 'Lo-Fi & Deep Work Beats', 'tastes', 'Instrumental study sessions & co-working streams', 'Radio', 32),
  ('specialty-coffee', 'Specialty Pour-Over Coffee', 'tastes', 'Third-wave cafes, espresso craft & coffee conversations', 'Coffee', 33),
  ('sci-fi-fantasy', 'Sci-Fi, Narnia & Tolkien', 'tastes', 'Lord of the Rings, Space Trilogy, Dune & mythic worldbuilding', 'Sparkles', 34),
  ('tech-podcasts', 'AI & Startup Podcasts', 'tastes', 'Discussing Lex Fridman, Latent Space, Hard Fork & tech trends', 'Mic', 35),
  ('theology-podcasts', 'BibleProject & Theology Podcasts', 'tastes', 'Exploring biblical themes, Hebrew/Greek context & sermons', 'Podcast', 36),
  ('early-bird', 'Early Bird Morning Rhythm', 'tastes', '5:30 AM devotionals, morning workouts & sunrise focus', 'Sun', 37),
  ('night-owl-builder', 'Night Owl Builder & Coder', 'tastes', 'Late-evening coding sprints, deep chats & quiet reflection', 'Moon', 38),
  ('deep-1v1-talks', 'Deep 1-on-1 Conversations', 'tastes', 'Meaningful heart-to-heart mentorship & intentional duo chats', 'MessageCircleHeart', 39),
  ('group-hangouts', 'Lively 3-4 Group Discussions', 'tastes', 'Collaborative small-circle brainstorming & group encouragement', 'MessagesSquare', 40)
on conflict (slug) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  icon_name = excluded.icon_name,
  sort_order = excluded.sort_order;

-- 2. SEED COMMUNITY BELIEVERS IN auth.users & public.profiles
do $$
declare
  u1 uuid := '11111111-1111-4111-8111-111111111101';
  u2 uuid := '11111111-1111-4111-8111-111111111102';
  u3 uuid := '11111111-1111-4111-8111-111111111103';
  u4 uuid := '11111111-1111-4111-8111-111111111104';
  u5 uuid := '11111111-1111-4111-8111-111111111105';
  u6 uuid := '11111111-1111-4111-8111-111111111106';
  u7 uuid := '11111111-1111-4111-8111-111111111107';
  u8 uuid := '11111111-1111-4111-8111-111111111108';

  r1 uuid := '22222222-2222-4222-8222-222222222201';
  r2 uuid := '22222222-2222-4222-8222-222222222202';
  r3 uuid := '22222222-2222-4222-8222-222222222203';
  r4 uuid := '22222222-2222-4222-8222-222222222204';

  p1 uuid := '33333333-3333-4333-8333-333333333301';
  p2 uuid := '33333333-3333-4333-8333-333333333302';
  p3 uuid := '33333333-3333-4333-8333-333333333303';
  p4 uuid := '33333333-3333-4333-8333-333333333304';
begin
  -- Ensure seed users exist in auth.users so FK constraints hold cleanly
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caleb.mathew@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Caleb Mathew"}'),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hannah.grace@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hannah Grace Thomas"}'),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'daniel.paul@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Daniel Paul Varghese"}'),
    (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'abigail.chen@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Abigail Joy Chen"}'),
    (u5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'micah.dsouza@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Micah D''Souza"}'),
    (u6, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lydia.fernandes@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lydia Fernandes"}'),
    (u7, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'joshua.prakash@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Joshua Prakash"}'),
    (u8, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rebecca.samuel@unitebyfaith.org', extensions.crypt('DemoFaith2026!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rebecca Samuel"}')
  on conflict (id) do nothing;

  insert into public.profiles (
    id, full_name, display_handle, avatar_url, headline, bio, denomination_or_tradition, church_or_fellowship, location_city, location_timezone, years_in_faith, fellowship_mode, onboarding_completed, is_demo_account
  )
  values
    (
      u1, 'Caleb Mathew', 'caleb_ai', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
      'Senior AI Engineer & Bible Study Facilitator',
      'Passionate about building ethical LLM agents, studying Romans & Hebrews, playing acoustic worship, and connecting with Christian technologists.',
      'Evangelical / Non-Denominational', 'Grace City Fellowship', 'Bengaluru, IN', 'Asia/Kolkata', '8+ years in Christ', 'both', true, true
    ),
    (
      u2, 'Hannah Grace Thomas', 'hannah_ml', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&auto=format&fit=crop&q=80',
      'Applied ML Researcher & Worship Pianist',
      'Working on multimodal AI/ML systems by day and leading youth worship on weekends. Love specialty pour-over coffee and C.S. Lewis.',
      'Reformed Evangelical', 'Redeemer Community Church', 'Hyderabad, IN', 'Asia/Kolkata', '10+ years in Christ', 'both', true, true
    ),
    (
      u3, 'Daniel Paul Varghese', 'daniel_fullstack', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
      'Full-Stack & AI Product Builder | Apologetics',
      'Building Next.js + AI tools for ministry and education. Always up for a chess match, badminton session, or deep apologetics discussion.',
      'Non-Denominational', 'New Life Fellowship', 'Chennai, IN', 'Asia/Kolkata', '6+ years in Christ', 'both', true, true
    ),
    (
      u4, 'Abigail Joy Chen', 'abigail_design', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&auto=format&fit=crop&q=80',
      'Principal Product Designer & Small Group Host',
      'Designing human-centered software and hosting weekly small-group dinners. Love indie worship, devotional journaling, and film photography.',
      'Baptist / Community', 'Cornerstone Chapel', 'Mumbai, IN', 'Asia/Kolkata', '5+ years in Christ', 'both', true, true
    ),
    (
      u5, 'Micah D''Souza', 'micah_worship', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
      'Acoustic Worship Leader & Cloud Architect',
      'Cloud/DevOps architect who loves writing scripture songs, hiking mountain trails, and mentoring young developers in faith and work.',
      'Charismatic / Spirit-Filled', 'Bethel Harbor Church', 'Pune, IN', 'Asia/Kolkata', '12+ years in Christ', 'both', true, true
    ),
    (
      u6, 'Lydia Fernandes', 'lydia_theology', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
      'Data Scientist & Apologetics Book Club Lead',
      'Data scientist exploring AI ethics and Christian philosophy. Huge fan of Tolkien, BibleProject podcasts, and third-wave coffee.',
      'Anglican / Reformed', 'St. Mark''s Fellowship', 'Bengaluru, IN', 'Asia/Kolkata', '9+ years in Christ', 'both', true, true
    ),
    (
      u7, 'Joshua Prakash', 'joshua_founder', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=240&auto=format&fit=crop&q=80',
      'SaaS Founder, Marathon Runner & Prayer Partner',
      'Bootstrapping an AI SaaS product while keeping Christ at the center. 5:30 AM runner looking for iron-sharpens-iron accountability.',
      'Non-Denominational', 'Hope City Church', 'Kochi, IN', 'Asia/Kolkata', '7+ years in Christ', 'both', true, true
    ),
    (
      u8, 'Rebecca Samuel', 'rebecca_learns', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80',
      'Software Engineer Transitioning into AI/ML',
      'Learning AI engineering and Python while serving in outreach ministry. Looking for a study pod and encouraging Christian peers!',
      'CSI / Mainline Protestant', 'Trinity Fellowship', 'Delhi NCR, IN', 'Asia/Kolkata', '4+ years in Christ', 'both', true, true
    )
  on conflict (id) do update set
    full_name = excluded.full_name,
    headline = excluded.headline,
    bio = excluded.bio,
    onboarding_completed = true;

  -- 3. SEED USER TAGS ACROSS ALL 4 PILLARS
  insert into public.user_tags (user_id, tag_slug, category, is_priority)
  values
    -- Caleb Mathew
    (u1, 'daily-bible-study', 'faith', true),
    (u1, 'faith-and-work', 'faith', false),
    (u1, 'christian-apologetics', 'faith', false),
    (u1, 'ai-engineering', 'skills', true),
    (u1, 'machine-learning', 'skills', true),
    (u1, 'fullstack-dev', 'skills', false),
    (u1, 'acoustic-guitar', 'hobbies', false),
    (u1, 'board-games-chess', 'hobbies', false),
    (u1, 'specialty-coffee', 'tastes', false),
    (u1, 'tech-podcasts', 'tastes', false),
    (u1, 'group-hangouts', 'tastes', false),

    -- Hannah Grace Thomas
    (u2, 'worship-ministry', 'faith', true),
    (u2, 'daily-bible-study', 'faith', false),
    (u2, 'prayer-intercession', 'faith', false),
    (u2, 'machine-learning', 'skills', true),
    (u2, 'ai-engineering', 'skills', true),
    (u2, 'data-science', 'skills', false),
    (u2, 'reading-books', 'hobbies', false),
    (u2, 'acoustic-guitar', 'hobbies', false),
    (u2, 'specialty-coffee', 'tastes', false),
    (u2, 'indie-worship', 'tastes', false),
    (u2, 'deep-1v1-talks', 'tastes', false),

    -- Daniel Paul Varghese
    (u3, 'christian-apologetics', 'faith', true),
    (u3, 'faith-and-work', 'faith', false),
    (u3, 'daily-bible-study', 'faith', false),
    (u3, 'ai-engineering', 'skills', true),
    (u3, 'fullstack-dev', 'skills', true),
    (u3, 'saas-entrepreneurship', 'skills', false),
    (u3, 'board-games-chess', 'hobbies', false),
    (u3, 'racquet-sports', 'hobbies', false),
    (u3, 'tech-podcasts', 'tastes', false),
    (u3, 'lofi-deep-focus', 'tastes', false),
    (u3, 'night-owl-builder', 'tastes', false),

    -- Abigail Joy Chen
    (u4, 'small-group-fellowship', 'faith', true),
    (u4, 'devotional-journaling', 'faith', false),
    (u4, 'worship-ministry', 'faith', false),
    (u4, 'product-design', 'skills', true),
    (u4, 'fullstack-dev', 'skills', false),
    (u4, 'ai-engineering', 'skills', false),
    (u4, 'photography-film', 'hobbies', true),
    (u4, 'cooking-baking', 'hobbies', false),
    (u4, 'indie-worship', 'tastes', false),
    (u4, 'specialty-coffee', 'tastes', false),
    (u4, 'group-hangouts', 'tastes', false),

    -- Micah D'Souza
    (u5, 'worship-ministry', 'faith', true),
    (u5, 'discipleship-mentoring', 'faith', false),
    (u5, 'faith-and-work', 'faith', false),
    (u5, 'cloud-devops', 'skills', true),
    (u5, 'ai-engineering', 'skills', false),
    (u5, 'acoustic-guitar', 'hobbies', true),
    (u5, 'hiking-outdoors', 'hobbies', false),
    (u5, 'indie-worship', 'tastes', false),
    (u5, 'specialty-coffee', 'tastes', false),
    (u5, 'early-bird', 'tastes', false),

    -- Lydia Fernandes
    (u6, 'christian-apologetics', 'faith', true),
    (u6, 'theology-history', 'faith', true),
    (u6, 'daily-bible-study', 'faith', false),
    (u6, 'data-science', 'skills', true),
    (u6, 'machine-learning', 'skills', false),
    (u6, 'reading-books', 'hobbies', false),
    (u6, 'board-games-chess', 'hobbies', false),
    (u6, 'sci-fi-fantasy', 'tastes', false),
    (u6, 'theology-podcasts', 'tastes', false),
    (u6, 'specialty-coffee', 'tastes', false),

    -- Joshua Prakash
    (u7, 'prayer-intercession', 'faith', true),
    (u7, 'faith-and-work', 'faith', false),
    (u7, 'discipleship-mentoring', 'faith', false),
    (u7, 'saas-entrepreneurship', 'skills', true),
    (u7, 'ai-engineering', 'skills', false),
    (u7, 'running-marathon', 'hobbies', true),
    (u7, 'strength-fitness', 'hobbies', false),
    (u7, 'early-bird', 'tastes', false),
    (u7, 'tech-podcasts', 'tastes', false),

    -- Rebecca Samuel
    (u8, 'missions-outreach', 'faith', false),
    (u8, 'daily-bible-study', 'faith', true),
    (u8, 'small-group-fellowship', 'faith', false),
    (u8, 'learning-to-code', 'skills', true),
    (u8, 'ai-engineering', 'skills', true),
    (u8, 'machine-learning', 'skills', false),
    (u8, 'reading-books', 'hobbies', false),
    (u8, 'cooking-baking', 'hobbies', false),
    (u8, 'lofi-deep-focus', 'tastes', false),
    (u8, 'group-hangouts', 'tastes', false)
  on conflict (user_id, tag_slug) do nothing;

  -- 4. SEED 3-4 MEMBER GROUP FELLOWSHIP PODS & CHAT ROOMS
  insert into public.chat_rooms (id, room_type, title, subtitle, shared_tags, active_icebreaker)
  values
    (
      r1,
      'pod_group',
      'Kingdom AI & LLM Builders Circle',
      '3-4 Member Fellowship Pod • Faith + AI Engineering & ML',
      array['ai-engineering', 'machine-learning', 'daily-bible-study', 'faith-and-work'],
      'Small Pod Icebreaker (3-4 Circle): Everyone here shares a passion for AI Engineering, Machine Learning, and Daily Bible Study! What AI project or skill are you building this month, and how can we pray for your work?'
    ),
    (
      r2,
      'pod_group',
      'Acoustic Worship & Specialty Coffee Pod',
      '3-4 Member Fellowship Pod • Worship + Guitar + Creative Craft',
      array['worship-ministry', 'acoustic-guitar', 'indie-worship', 'specialty-coffee'],
      'Small Pod Icebreaker (3-4 Circle): Welcome worshipers and creatives! Share a worship song or scripture that has anchored you lately and your go-to coffee order.'
    ),
    (
      r3,
      'pod_group',
      'Apologetics, Theology & Inklings Circle',
      '3-4 Member Fellowship Pod • Apologetics + Sci-Fi/Tolkien + Data/Tech',
      array['christian-apologetics', 'theology-history', 'sci-fi-fantasy', 'reading-books'],
      'Small Pod Icebreaker (3-4 Circle): C.S. Lewis, apologetics, and deep theology! Which book or chapter of Scripture are you currently wrestling with or enjoying?'
    ),
    (
      r4,
      'pod_group',
      '5:30 AM Prayer, Founders & Running Pod',
      '3-4 Member Fellowship Pod • Early Bird Prayer + SaaS + Endurance',
      array['prayer-intercession', 'saas-entrepreneurship', 'running-marathon', 'early-bird'],
      'Small Pod Icebreaker (3-4 Circle): Rise & shine builders! Share your #1 spiritual goal and #1 builder/fitness milestone for this week.'
    )
  on conflict (id) do nothing;

  insert into public.pods (
    id, chat_room_id, title, description, focus_pillar, anchor_tags, min_members, max_members, member_count, meeting_cadence, status, created_by
  )
  values
    (
      p1, r1,
      'Kingdom AI & LLM Builders Circle',
      'A tight-knit 3–4 believer pod for AI/ML engineers and learners integrating Scripture with cutting-edge LLM and agent engineering.',
      'faith_and_skills',
      array['ai-engineering', 'machine-learning', 'daily-bible-study', 'faith-and-work'],
      3, 4, 3, 'Thursdays 8:30 PM IST + Daily Async Chat', 'active', u1
    ),
    (
      p2, r2,
      'Acoustic Worship & Specialty Coffee Pod',
      '3–4 songwriters, guitarists, and creatives sharing acoustic worship sessions, devotionals, and third-wave coffee culture.',
      'faith_and_hobbies',
      array['worship-ministry', 'acoustic-guitar', 'indie-worship', 'specialty-coffee'],
      3, 4, 3, 'Saturdays 10:00 AM IST + Song Demos', 'active', u5
    ),
    (
      p3, r3,
      'Apologetics, Theology & Inklings Circle',
      'Exploring Christian apologetics, church history, C.S. Lewis & Tolkien alongside tech and analytical careers in a 3–4 person pod.',
      'faith_and_tastes',
      array['christian-apologetics', 'theology-history', 'sci-fi-fantasy', 'reading-books'],
      3, 4, 3, 'Tuesdays 9:00 PM IST + Book Chapter Threads', 'active', u6
    ),
    (
      p4, r4,
      '5:30 AM Prayer, Founders & Running Pod',
      'Early-riser Christian founders, engineers, and runners checking in for morning scripture, intercession, and marathon accountability.',
      'faith_and_skills',
      array['prayer-intercession', 'saas-entrepreneurship', 'running-marathon', 'early-bird'],
      3, 4, 3, 'Weekdays 6:00 AM IST Check-In', 'active', u7
    )
  on conflict (id) do nothing;

  insert into public.pod_members (pod_id, user_id, role)
  values
    -- Pod 1 (3/4 members -> 1 open seat for the user!)
    (p1, u1, 'facilitator'),
    (p1, u2, 'member'),
    (p1, u3, 'member'),

    -- Pod 2 (3/4 members -> 1 open seat!)
    (p2, u5, 'facilitator'),
    (p2, u4, 'member'),
    (p2, u2, 'member'),

    -- Pod 3 (3/4 members -> 1 open seat!)
    (p3, u6, 'facilitator'),
    (p3, u3, 'member'),
    (p3, u8, 'member'),

    -- Pod 4 (3/4 members -> 1 open seat!)
    (p4, u7, 'facilitator'),
    (p4, u1, 'member'),
    (p4, u5, 'member')
  on conflict (pod_id, user_id) do nothing;

  -- 5. SEED INITIAL REAL-TIME MESSAGES IN POD ROOMS
  insert into public.chat_messages (id, room_id, sender_id, message_type, content, created_at)
  values
    (
      '44444444-4444-4444-8444-444444444401', r1, u1, 'icebreaker',
      'Small Pod Icebreaker (3-4 Circle): Everyone here shares a passion for AI Engineering, Machine Learning, and Daily Bible Study! What AI project or skill are you building this month, and how can we pray for your work?',
      now() - interval '3 hours'
    ),
    (
      '44444444-4444-4444-8444-444444444402', r1, u1, 'text',
      'Hey team! Excited for our 3-4 person circle. I am currently building an evaluation harness for RAG agents at work and reading through Colossians 1 ("in Him all things hold together"). We have 1 seat open for a 4th builder!',
      now() - interval '2 hours 40 minutes'
    ),
    (
      '44444444-4444-4444-8444-444444444403', r1, u2, 'text',
      'Amen Caleb! Colossians 1:17 is one of my favorite verses as an ML researcher. I am fine-tuning a small vision-language model this week—would love prayer for clarity on our paper deadline on Friday.',
      now() - interval '2 hours 15 minutes'
    ),
    (
      '44444444-4444-4444-8444-444444444404', r1, u3, 'text',
      'Praying for your deadline Hannah! I am experimenting with Next.js + Supabase pgvector for semantic scripture cross-referencing. Can''t wait to welcome our 4th pod member!',
      now() - interval '1 hour 50 minutes'
    ),
    (
      '44444444-4444-4444-8444-444444444405', r2, u5, 'icebreaker',
      'Small Pod Icebreaker (3-4 Circle): Welcome worshipers and creatives! Share a worship song or scripture that has anchored you lately and your go-to coffee order.',
      now() - interval '4 hours'
    ),
    (
      '44444444-4444-4444-8444-444444444406', r2, u5, 'text',
      'Grace and peace everyone! Been fingerpicking Psalm 23 on acoustic guitar all week with a hot Ethiopian V60 pour-over.',
      now() - interval '3 hours 20 minutes'
    ),
    (
      '44444444-4444-4444-8444-444444444407', r2, u4, 'text',
      'Love that Micah! I just brewed a cortado and sketched out chord charts for our Sunday evening gathering.',
      now() - interval '2 hours 10 minutes'
    )
  on conflict (id) do nothing;

  -- 6. SEED PRAYER REQUESTS & SHARED GOALS IN ROOM PINS
  insert into public.room_pins (id, room_id, author_id, pin_type, title, body, amen_count, is_answered)
  values
    (
      '55555555-5555-4555-8555-555555555501', r1, u2, 'prayer',
      'Wisdom & Peace for Friday ML Research Submission',
      'Praying for integrity, clear experimental results, and rest for our lab team.',
      4, false
    ),
    (
      '55555555-5555-4555-8555-555555555502', r1, u3, 'goal',
      'Pod Study Goal: Colossians + Ethical AI Discussion',
      'Read Colossians chapters 1–2 and share 1 takeaway on how Christ shapes our engineering craft.',
      3, false
    ),
    (
      '55555555-5555-4555-8555-555555555503', r2, u5, 'prayer',
      'Upcoming Youth Worship Night',
      'Praying that students encounter God''s peace during our acoustic worship set.',
      5, false
    )
  on conflict (id) do nothing;
end $$;

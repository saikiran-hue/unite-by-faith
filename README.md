# Unite by Faith

**Find Christian friends who share your faith and your everyday life.**

Unite by Faith matches Christians aged 18 and over into small **Fellowship Pods** (groups of 3–4) and **1v1 matches** (friendship only, same gender). The idea is to spend less time scrolling social media and more time talking, praying and growing with the right people.

- 🌐 Live: https://unite-by-faith.swipecraft.in
- 🙏 Free forever: no paid plans, no ads, and your data is never sold
- 💬 **Not a dating app.** It's only for friendship, faith and growth.

## How matching works

Faith comes first. Your everyday interests come next.

| Part | Weight | What it looks at |
|------|--------|------------------|
| Faith | 40% | Tradition, where you are in your faith, and faith habits such as Bible study, prayer and worship |
| Interests | 35% | Hobbies, tastes, skills, and personal topics you write in your own words, like "learning English" or "World War 2" |
| Life Fit | 25% | Age range, city and when you're free |

- Each habit has a level: how much you do it. You can star the habits that matter most, and they count double.
- Personal topics are matched by meaning, so "learning English" can match "improving my English".
- Your birth date and gender stay private. They are used only for the 18+ check, age matching and the same-gender 1v1 filter.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + TypeScript
- **Supabase**: Postgres with row-level security, Google sign-in, pgvector
- **Supabase Edge Function** (`supabase/functions/embed`): `gte-small` text embeddings for match-by-meaning
- **Cloudflare Workers** via OpenNext, for hosting
- **Vitest** for tests

## Run it locally

You need Node 20+, npm and a Supabase project (either local with the [Supabase CLI](https://supabase.com/docs/guides/cli) or hosted).

```bash
git clone https://github.com/saikiran-hue/unite-by-faith.git
cd unite-by-faith
npm install
cp .env.example .env.local   # then fill in your own values
```

Apply the database migrations in `supabase/migrations` (in order) to your project. For local Supabase:

```bash
supabase start
supabase db reset            # runs every migration
supabase functions serve embed
```

Then:

```bash
npm run dev                  # http://localhost:3000
npm test                     # run the test suite
```

### Environment variables

| Name | What it is |
|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. Never commit it or expose it to the browser. |
| `DEMO_ACCOUNT_PASSWORD` | Optional. Password for local demo accounts (the demo switcher only works in development). |

## Project layout

```
src/app/              pages and API routes
src/components/       UI components (design system in src/components/ubf)
src/lib/matching/     matching engine: scoring, filters, embeddings
supabase/migrations/  database schema and row-level security policies
supabase/functions/   edge functions (embeddings)
scripts/              catalogue, embedding and deploy helpers
```

## Contributing

Contributions are welcome, especially community-friendly features, accessibility fixes and translations.

1. Fork the repo and create a branch.
2. Keep changes small and focused, and add tests where they make sense.
3. Run `npm test` and `npm run lint` before you open a pull request.
4. Explain what you changed and why.

Please keep the spirit of the project: faith first, kind to people, never a dating app, and no ads or tracking.

Found a security issue? Please don't open a public issue. Email swipecraft.in@gmail.com instead.

## License

[MIT](LICENSE). Free to use, change and share.

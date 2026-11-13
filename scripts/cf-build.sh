#!/usr/bin/env bash
# Cloudflare build without secrets in the bundle.
# OpenNext inlines every .env* file into the worker, so build with only the public values
# (.env.production, generated from .env.local's NEXT_PUBLIC_* lines) and keep .env.local out of the way.
# Server secrets are set on the worker with `wrangler secret put`.
set -euo pipefail
cd "$(dirname "$0")/.."
grep -E '^NEXT_PUBLIC_' .env.local > .env.production
mv .env.local .env.local.cf-build-hold
trap 'mv .env.local.cf-build-hold .env.local; rm -f .env.production' EXIT
npx opennextjs-cloudflare build

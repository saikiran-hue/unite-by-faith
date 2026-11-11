#!/usr/bin/env bash
# Asserts the server trusts only the Supabase session. Needs the dev server on :3000.
BASE="${BASE:-http://localhost:3000}"
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}

check "GET /api/state signed out" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/state")"
check "GET /api/state forged cookie" 401 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cookie: ubf_active_user_id=11111111-1111-4111-8111-111111111102' "$BASE/api/state")"
check "GET / signed out" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
loc="$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/")"
case "$loc" in */auth) echo "PASS redirect Location ends in /auth ($loc)";; *) echo "FAIL redirect Location: $loc"; fail=1;; esac
check "GET /auth passes through" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/auth")"

exit $fail

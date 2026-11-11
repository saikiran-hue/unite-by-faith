#!/usr/bin/env bash
# Asserts the server trusts only the Supabase session. Needs the dev server on :3000.
# WRITES DATA (sign-up creates a user): run it only against a dev server pointed at the LOCAL Supabase stack.
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

# --- 401 on write routes when signed out ---
for r in duos pods onboarding; do
  check "POST /api/$r signed out" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/$r")"
done

# --- sign-in modes ---
JAR="$(mktemp)"; JAR2="$(mktemp)"; trap 'rm -f "$JAR" "$JAR2"' EXIT
post() { # jar json -> prints "<body> <status>"
  curl -s -w ' %{http_code}' -b "$1" -c "$1" -X POST -H 'Content-Type: application/json' -d "$2" "$BASE/api/auth/switch"
}
status() { local o; o="$(post "$1" "$2")"; echo "${o##* }"; } # jar json -> status only
viewer() { curl -s -b "$1" "$BASE/api/state" | sed -n 's/.*"currentUser":{"id":"\([^"]*\)".*/\1/p'; }
state() { curl -s -o /dev/null -w '%{http_code}' -b "$1" "$BASE/api/state"; }
signup_json() { # name email password birthDate (password/birthDate may be empty = omitted)
  local pw="" bd=""
  [ -n "$3" ] && pw=",\"password\":\"$3\""
  [ -n "$4" ] && bd=",\"birthDate\":\"$4\""
  echo "{\"mode\":\"signup\",\"fullName\":\"$1\",\"email\":\"$2\"$pw$bd,\"today\":\"$TODAY\"}"
}
signin_json() { printf '{"mode":"signin","email":"%s","password":"%s"}' "$1" "$2"; }
demo_json() { printf '{"mode":"demo","userId":"%s"}' "$1"; }
DEMO_ID="11111111-1111-4111-8111-111111111102"
TODAY="$(date +%Y-%m-%d)"
YEAR="$(date +%Y)"
EMAIL="check.$(date +%s).$$@example.com"

check "GET /api/auth/demo-profiles public" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/demo-profiles")"

out="$(post "$JAR" "$(signup_json 'Young Person' "$EMAIL" secret12 "$((YEAR-17))-01-01")")"
check "signup under 18" 400 "${out##* }"
case "$out" in *birthDate*) echo "PASS under-18 error names birthDate";; *) echo "FAIL under-18 error body: $out"; fail=1;; esac
check "signup future birth date" 400 "$(status "$JAR" "$(signup_json 'X Y' "$EMAIL" secret12 "$((YEAR+1))-01-01")")"
check "signup missing password" 400 "$(status "$JAR" "$(signup_json 'X Y' "$EMAIL" '' 1980-01-01)")"

out="$(post "$JAR" "$(signup_json 'Check Person' "$EMAIL" secret12 1980-01-01)")"
check "signup adult" 200 "${out##* }"
NEW_ID="$(echo "$out" | sed -n 's/.*"userId":"\([^"]*\)".*/\1/p')"
check "state after signup is the new user" "$NEW_ID" "$(viewer "$JAR")"
check "signup duplicate email" 409 "$(status "$JAR2" "$(signup_json 'Check Person' "$EMAIL" secret12 1980-01-01)")"
check "signin wrong password" 401 "$(status "$JAR2" "$(signin_json "$EMAIL" wrongpass)")"
check "signin right password" 200 "$(status "$JAR2" "$(signin_json "$EMAIL" secret12)")"
check "state after signin is the new user" "$NEW_ID" "$(viewer "$JAR2")"
check "signout" 200 "$(status "$JAR2" '{"mode":"signout"}')"
check "/api/state after signout" 401 "$(state "$JAR2")"

# --- demo mode ---
: > "$JAR2"
check "demo mode with a non-demo id" 403 "$(status "$JAR2" "$(demo_json "$NEW_ID")")"
check "/api/state after refused demo" 401 "$(state "$JAR2")"
check "demo mode with a demo id" 200 "$(status "$JAR2" "$(demo_json "$DEMO_ID")")"
check "state viewer is the demo id" "$DEMO_ID" "$(viewer "$JAR2")"
check "signout (demo)" 200 "$(status "$JAR2" '{"mode":"signout"}')"
check "/api/state after demo signout" 401 "$(state "$JAR2")"

exit $fail

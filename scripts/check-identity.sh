#!/usr/bin/env bash
# Asserts the server trusts only the Supabase session. Needs the dev server on :3000.
# WRITES DATA (sign-up creates a user), so it refuses to run unless you opt in:
# start the dev server against the LOCAL Supabase stack (127.0.0.1:54321), then run
#   LOCAL=1 bash scripts/check-identity.sh
BASE="${BASE:-http://localhost:3000}"
if [ "${LOCAL:-}" != "1" ]; then
  echo "Refusing to run: this script creates users. Point the dev server at the LOCAL Supabase stack and re-run with LOCAL=1." >&2
  exit 2
fi
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

# --- rooms: members only ---
CALEB="11111111-1111-4111-8111-111111111101"   # member of rooms ...201 and ...204
ROOM_IN="22222222-2222-4222-8222-222222222201"
ROOM_OUT="22222222-2222-4222-8222-222222222202" # Caleb is not a member
PIN_OUT="55555555-5555-4555-8555-555555555503"  # a pin in ROOM_OUT
room() { # jar method room [json] -> status
  if [ -n "$4" ]; then
    curl -s -o /dev/null -w '%{http_code}' -b "$1" -X "$2" -H 'Content-Type: application/json' -d "$4" "$BASE/api/rooms/$3"
  else
    curl -s -o /dev/null -w '%{http_code}' -b "$1" "$BASE/api/rooms/$3"
  fi
}
# The signout above ends every session of the new user, so sign in again.
: > "$JAR"
check "signin new user again" 200 "$(status "$JAR" "$(signin_json "$EMAIL" secret12)")"
check "GET room signed out" 401 "$(room /dev/null GET "$ROOM_IN")"
check "GET room as non-member (new user)" 403 "$(room "$JAR" GET "$ROOM_IN")"
check "POST message as non-member (new user)" 403 "$(room "$JAR" POST "$ROOM_IN" '{"action":"message","content":"intruder"}')"
: > "$JAR2"
check "demo sign-in Caleb" 200 "$(status "$JAR2" "$(demo_json "$CALEB")")"
check "GET own room as member" 200 "$(room "$JAR2" GET "$ROOM_IN")"
check "GET another room as non-member" 403 "$(room "$JAR2" GET "$ROOM_OUT")"
check "POST message into another room" 403 "$(room "$JAR2" POST "$ROOM_OUT" '{"action":"message","content":"intruder"}')"
check "POST create_pin into another room" 403 "$(room "$JAR2" POST "$ROOM_OUT" '{"action":"create_pin","title":"intruder"}')"
AMEN_JSON="$(printf '{"action":"amen_pin","pinId":"%s"}' "$PIN_OUT")"
TOGGLE_JSON="$(printf '{"action":"toggle_answered","pinId":"%s"}' "$PIN_OUT")"
check "amen_pin on a pin from another room" 404 "$(room "$JAR2" POST "$ROOM_IN" "$AMEN_JSON")"
check "toggle_answered on a pin from another room" 404 "$(room "$JAR2" POST "$ROOM_IN" "$TOGGLE_JSON")"

# --- PostgREST direct (0012): anon reads nothing, seat/duo RPCs are server-only ---
SB_URL="${SB_URL:-http://127.0.0.1:54321}"
ANON="${ANON_KEY:-$(npx supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')}"
rest() { # token method path [json] -> "<body> <status>"
  curl -s -w ' %{http_code}' -X "$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' ${4:+-d "$4"} "$SB_URL/rest/v1/$3"
}
for t in chat_messages room_pins chat_rooms duo_matches; do
  check "anon GET /rest/v1/$t returns no rows" "[] 200" "$(rest "$ANON" GET "$t?select=*")"
done
POD_IN="33333333-3333-4333-8333-333333333302"   # a pod the new user is not in
JOIN_JSON="$(printf '{"p_pod_id":"%s","p_user_id":"%s"}' "$POD_IN" "$CALEB")"
DUO_JSON="$(printf '{"p_user_id":"%s","p_partner_id":"%s"}' "$CALEB" "$NEW_ID")"
out="$(rest "$ANON" POST rpc/join_pod_atomic "$JOIN_JSON")"; check "anon rpc join_pod_atomic denied" 401 "${out##* }"
out="$(rest "$ANON" POST rpc/start_or_get_duo_chat "$DUO_JSON")"; check "anon rpc start_or_get_duo_chat denied" 401 "${out##* }"
TOKEN="$(curl -s -X POST -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s","password":"secret12"}' "$EMAIL")" "$SB_URL/auth/v1/token?grant_type=password" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] && echo "PASS got a user access token" || { echo "FAIL no user access token"; fail=1; }
out="$(rest "$TOKEN" POST rpc/join_pod_atomic "$JOIN_JSON")"; check "authenticated rpc join_pod_atomic denied" 403 "${out##* }"
out="$(rest "$TOKEN" POST rpc/start_or_get_duo_chat "$DUO_JSON")"; check "authenticated rpc start_or_get_duo_chat denied" 403 "${out##* }"
check "authenticated non-member reads no chat_messages" "[] 200" "$(rest "$TOKEN" GET "chat_messages?select=id&room_id=eq.$ROOM_IN")"
check "authenticated non-member reads no room_pins" "[] 200" "$(rest "$TOKEN" GET "room_pins?select=id&room_id=eq.$ROOM_IN")"
out="$(rest "$TOKEN" POST pod_members "$(printf '{"pod_id":"%s","user_id":"%s"}' "$POD_IN" "$NEW_ID")")"
check "authenticated direct pod_members insert denied" 403 "${out##* }"
out="$(rest "$TOKEN" POST duo_matches "$(printf '{"user_a_id":"%s","user_b_id":"%s","chat_room_id":"%s"}' "$CALEB" "$NEW_ID" "$ROOM_IN")")"
check "authenticated direct duo_matches insert denied" 403 "${out##* }"
out="$(rest "$TOKEN" POST chat_messages "$(printf '{"room_id":"%s","sender_id":"%s","content":"intruder"}' "$ROOM_IN" "$NEW_ID")")"
check "authenticated non-member chat_messages insert denied" 403 "${out##* }"
check "authenticated non-member pin update changes nothing" "[] 200" "$(rest "$TOKEN" PATCH "room_pins?id=eq.$PIN_OUT&select=id" '{"is_answered":true}')"

# --- Connect / Join run the hard filters (I2) ---
HANNAH="11111111-1111-4111-8111-111111111102"   # woman
DANIEL="11111111-1111-4111-8111-111111111103"   # man, passes Caleb's rules
api() { # jar route json -> "<body> <status>"
  curl -s -w ' %{http_code}' -b "$1" -X POST -H 'Content-Type: application/json' -d "$3" "$BASE/api/$2"
}
out="$(api "$JAR" duos "$(printf '{"partnerId":"%s"}' "$CALEB")")"; check "real account connecting to a demo id" 403 "${out##* }"
out="$(api "$JAR" pods "$(printf '{"action":"join","podId":"%s"}' "$POD_IN")")"; check "real account joining a demo pod" 403 "${out##* }"
out="$(api "$JAR2" duos "$(printf '{"partnerId":"%s"}' "$HANNAH")")"; check "connect to an opposite-gender id" 403 "${out##* }"
out="$(api "$JAR2" duos "$(printf '{"partnerId":"%s","similarityScore":5}' "$DANIEL")")"; check "connect to an eligible id" 200 "${out##* }"
ROOM1="$(echo "$out" | sed -n 's/.*"chat_room_id":"\([^"]*\)".*/\1/p')"
SCORE="$(echo "$out" | sed -n 's/.*"similarity_score":\([0-9.]*\).*/\1/p')"
[ -n "$SCORE" ] && [ "$SCORE" != "5" ] && echo "PASS stored score is server-side ($SCORE, client sent 5)" || { echo "FAIL stored score: $out"; fail=1; }
out="$(api "$JAR2" duos "$(printf '{"partnerId":"%s"}' "$DANIEL")")"
check "connect again returns the same room" "$ROOM1" "$(echo "$out" | sed -n 's/.*"chat_room_id":"\([^"]*\)".*/\1/p')"
out="$(api "$JAR2" pods "$(printf '{"action":"join","podId":"%s"}' "$POD_IN")")"; check "Caleb joins an eligible pod" 200 "${out##* }"
out="$(api "$JAR2" pods '{"action":"create","title":"Check pod","description":"made by check-identity"}')"; check "create group is not blocked" 200 "${out##* }"

# --- search_tags_vector is not callable by anon (M4) ---
VEC="$(python3 -c 'print("[" + ",".join(["0"]*384) + "]")' 2>/dev/null)"
VEC_JSON="$(printf '{"q":"%s","k":1}' "$VEC")"
out="$(rest "$ANON" POST rpc/search_tags_vector "$VEC_JSON")"; check "anon rpc search_tags_vector denied" 401 "${out##* }"
out="$(rest "$TOKEN" POST rpc/search_tags_vector "$VEC_JSON")"; check "authenticated rpc search_tags_vector allowed" 200 "${out##* }"

exit $fail

#!/usr/bin/env bash
# sign-in-journey.sh: the Russian sign-in journeys of ADR 0036 against a running local deployment
# (TLS_MODE=internal), over HTTPS through the proxy, two browsers being two cookie jars, until the
# browser screens of Stage 340 part B exist (docs/adr/0037-deployment.md, part B notes):
#   1. the operator seeds the review campaign and prints the DM's link; the DM joins with it;
#   2. the DM invites a player for Elowen; the player joins, reads Russian and explores (asks
#      Mira, takes the road, enters and inspects the caravan site); both live streams are open
#      (cookie and `Sec-Fetch-Site: same-origin`, as a browser's EventSource sends them);
#   3. the DM revokes the player: the player's stream closes at once (`closed`, unauthenticated)
#      and every request of that browser is 401, the cookie cleared;
#   4. a used player link, the used DM link, a revoked and a forged link fail with one fixed 401;
#      a signed-in browser gets 409 instead of spending an invitation;
#   5. cross-site requests are refused through the proxy; the DM signs out, the stream closes;
#   6. no token or session cookie appears in any log of the proxy or the server.
# Rerunnable on the same stack. Tokens, links and cookies are never printed (<token>, <session>).
# Prints one line per check; exit status 1 if any failed.
source "$(dirname "$0")/../scripts/lib.sh"
source "$(dirname "$0")/http.sh"

ELOWEN=elowen-starwhisper
SITE=abandoned-caravan-site
SITE_TEXT='Сломанные повозки и разбросанные ящики заполняют придорожную поляну: здесь напали на гильдейский караван.'
STAMP=$(date +%s)
failures=0
umask 077
: >"$WORK/secrets"

check() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    printf 'PASS  %s\n' "$label"
  else
    printf 'FAIL  %s\n' "$label"
    failures=$((failures + 1))
  fi
}
is() { [ "$1" = "$2" ]; }
field() { jq -r "$1" "$WORK/response.body" 2>/dev/null || true; }
has_text() { grep -qF "$1" "$WORK/response.body"; }
# Credentials seen so far, one per line in a private file: matched with grep -f, never passed
# on a command line.
keep() { [ -z "$1" ] || printf '%s\n' "$1" >>"$WORK/secrets"; }
# holds <file> <secret>: whether the file contains that secret.
holds() { printf '%s\n' "$2" >"$WORK/needle" && grep -qFf "$WORK/needle" "$1"; }
asked() { case $played in '200 accepted '* | *' rejected NO_EFFECT') return 0 ;; *) return 1 ;; esac; }
listing_clean() {
  ! grep -qE '"(link|token)"' "$WORK/response.body" && ! holds "$WORK/response.body" "$player_token"
}
sessions_clean() {
  [ "$(jq -r '[.sessions[].role] | sort | join(" ")' "$WORK/sessions.json")" = 'dm player' ] &&
    ! holds "$WORK/sessions.json" "$dm_session" && ! holds "$WORK/sessions.json" "$player_session"
}
refused_alike() { [ "$1" = 401 ] && no_cookie_set; }
logs_clean() { [ "$(wc -l <"$WORK/secrets")" -ge 5 ] && ! grep -qFf "$WORK/secrets" "$WORK/logs.txt"; }
link_ok() { case $1 in "$ORIGIN/join#"*) [ "${#2}" -eq 43 ] ;; *) return 1 ;; esac; }
strict_cookie() {
  case $(header set-cookie) in
    ltw_session=*'Path=/api; HttpOnly; SameSite=Strict; Max-Age='*'; Secure') return 0 ;;
    *) return 1 ;;
  esac
}
clearing_cookie() { case $(header set-cookie) in 'ltw_session=;'*'Max-Age=0'*) return 0 ;; *) return 1 ;; esac; }
no_cookie_set() { [ -z "$(header set-cookie)" ]; }
# A browser's EventSource on this origin: no Origin, same-origin fetch metadata, the cookie.
stream() {
  stream_open "$@" --header 'Accept: text/event-stream' --header 'Sec-Fetch-Site: same-origin' \
    --header 'Sec-Fetch-Mode: cors'
}
# play <name> <command JSON>: the player's command; its answer printed, status left in $played.
play() {
  local status
  status=$(post player "/campaigns/$CAMPAIGN/commands" \
    "{\"commandId\":\"review-$1-$STAMP\",\"command\":$2}")
  played="$status $(field .status) $(field '.code // ""')"
  printf '     %s: %s\n' "$1" "$(jq -c 'del(.commandId)' "$WORK/response.body" 2>/dev/null || body)"
}
accepted() { case $played in '200 accepted '*) return 0 ;; *) return 1 ;; esac; }
place() {
  get player "/campaigns/$CAMPAIGN/surroundings?perspective=CHARACTER:$ELOWEN" >/dev/null
  field '.location.entityId'
}

say 'the operator: review campaign and the DM link (deploy/scripts/review-campaign.sh)'
"$DEPLOY_DIR/scripts/review-campaign.sh" --expires-hours 1 >"$WORK/operator.out" 2>&1 ||
  die "review-campaign.sh failed: $(redact <"$WORK/operator.out")"
redact <"$WORK/operator.out"
dm_link=$(grep '^{' "$WORK/operator.out" | tail -n 1 | jq -r .link) ||
  die 'the operator printed no DM link'
dm_token=$(token_of "$dm_link")
keep "$dm_token"
check 'the DM link is <PUBLIC_ORIGIN>/join#<43-character token>' link_ok "$dm_link" "$dm_token"

say 'the DM joins through the link'
status=$(redeem dm "$dm_token")
[ "$status" = 200 ] || die "the DM invitation was refused ($status)"
printf '     answer %s; Set-Cookie: %s\n' "$(body)" "$(header set-cookie | redact)"
check 'redeem answers the campaign' is "$(field .campaignId)" "$CAMPAIGN"
check 'session cookie: Path=/api, HttpOnly, SameSite=Strict, Secure' strict_cookie
dm_session=$(session_of dm)
keep "$dm_session"
check 'GET /api/auth/session (same-origin): the campaign' is "$(get dm /auth/session)$(body)" \
  "200{\"campaignId\":\"$CAMPAIGN\"}"
get dm "/campaigns/$CAMPAIGN/session" >/dev/null
printf '     %s\n' "$(jq -c '{role, campaign}' "$WORK/response.body")"
check 'the DM sees the Russian campaign' is "$(field '.role + " " + .campaign.name + " " + .campaign.language')" \
  'DM Пропавший караван ru'
dm_open=$(now)
stream dm-stream dm DM
ready=$(arrival dm-stream '^event: ready' 1 15) && say "DM live stream ready after $(since "$ready" "$dm_open") s" ||
  check 'the DM live stream opens' false

say 'the DM invites a player for Elowen'
status=$(post dm "/campaigns/$CAMPAIGN/invitations" "{\"characterId\":\"$ELOWEN\",\"expiresHours\":1}")
printf '     %s %s\n' "$status" "$(redact <"$WORK/response.body")"
check 'invitation created (201)' is "$status" 201
player_link=$(field .link)
player_token=$(token_of "$player_link")
keep "$player_token"
check 'the player link is <PUBLIC_ORIGIN>/join#<43-character token>' link_ok "$player_link" "$player_token"

say 'the player joins in another browser'
status=$(redeem player "$player_token")
[ "$status" = 200 ] || die "the player invitation was refused ($status)"
check 'session cookie: Path=/api, HttpOnly, SameSite=Strict, Secure' strict_cookie
player_session=$(session_of player)
keep "$player_session"
get player "/campaigns/$CAMPAIGN/session" >/dev/null
printf '     %s\n' "$(jq -c '{role, character, campaign}' "$WORK/response.body")"
check 'the player holds Elowen in Russian' is "$(field '.role + " " + .character.name')" \
  'PLAYER Эловен Старвиспер'
player_open=$(now)
stream player-stream player "CHARACTER:$ELOWEN"
ready=$(arrival player-stream '^event: ready' 1 15) &&
  say "player live stream ready after $(since "$ready" "$player_open") s" ||
  check 'the player live stream opens' false
check 'the player cannot list invitations (404)' is "$(get player "/campaigns/$CAMPAIGN/invitations")" 404
check 'the player cannot read as the DM (403)' is \
  "$(get player "/campaigns/$CAMPAIGN/knowledge?perspective=DM")" 403

say 'the player explores (the Russian investigation)'
dm_changes=$(grep -c '^event: changed' "$WORK/dm-stream.raw" || true)
if [ "$(place)" != market-square ]; then
  play market "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"market-square\"}"
  check 'back to the market square' accepted
fi
play ask "{\"type\":\"AskAbout\",\"characterId\":\"$ELOWEN\",\"npcId\":\"mira-vale\",\"topicId\":\"guild-caravan\"}"
check 'ask Mira about the guild caravan (or nothing new on a rerun)' asked
play road "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"old-trade-road\"}"
check 'take the Old Trade Road' accepted
play site "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"$SITE\"}"
check 'enter the place off the road' accepted
play inspect "{\"type\":\"ExamineEntity\",\"characterId\":\"$ELOWEN\",\"entityId\":\"$SITE\",\"method\":\"inspect\"}"
check 'inspect it' accepted
get player "/campaigns/$CAMPAIGN/surroundings?perspective=CHARACTER:$ELOWEN" >/dev/null
printf '     now at: %s\n' "$(jq -c '.location' "$WORK/response.body")"
check 'the place is identified in Russian' is "$(field .location.name)" 'Заброшенная стоянка каравана'
get player "/campaigns/$CAMPAIGN/knowledge?perspective=CHARACTER:$ELOWEN" >/dev/null
check 'the player reads the discovery in Russian' has_text "$SITE_TEXT"
check "the DM's stream signalled the changes" arrival dm-stream '^event: changed' $((dm_changes + 1)) 3

say 'the DM sees the members and invitations (never a token)'
status=$(get dm "/campaigns/$CAMPAIGN/invitations")
printf '     %s\n' "$(jq -c '{members, invitations: [.invitations[] | {purpose, characterId, status}]}' "$WORK/response.body")"
check 'Elowen is a member with one live session' is \
  "$(field "[.members[] | select(.characterId == \"$ELOWEN\") | .activeSessions] | first")" 1
check 'no link or token in the listing' listing_clean
server_node "$SERVER_DIST/auth/operator-cli.js" sessions --campaign "$CAMPAIGN" >"$WORK/sessions.json"
printf '     operator sessions: %s\n' "$(jq -c '[.sessions[] | {role, characterIds}]' "$WORK/sessions.json")"
check 'the operator lists both sessions without a secret' sessions_clean

say "the DM revokes the player: the player's screen is signed out at once"
revoked=$(now)
status=$(post dm "/campaigns/$CAMPAIGN/members/$ELOWEN/revoke" '{}')
printf '     %s %s\n' "$status" "$(body)"
check 'revoked: released, one session' is "$status $(field '[.released, .sessionsRevoked] | join(" ")')" \
  '200 true 1'
if closed=$(arrival player-stream '^data: {"reason":"unauthenticated"}' 1 3); then
  say "player stream: closed (unauthenticated) $(since "$closed" "$revoked") s after the revocation"
  check "the player's stream ended" ended player-stream 3
else
  check "the player's stream closed within 3 s" false
fi
check "the DM's stream stays open" is "$(cat "$WORK/dm-stream.exit" 2>/dev/null)" ''
check 'the player can no longer act (401)' is "$(post player "/campaigns/$CAMPAIGN/commands" \
  "{\"commandId\":\"review-after-$STAMP\",\"command\":{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"old-trade-road\"}}")" 401
check 'the player can no longer read (401)' is "$(get player "/campaigns/$CAMPAIGN/session")" 401
check 'GET /api/auth/session: 401' is "$(get player /auth/session)" 401
check '... and the cookie it presented is cleared' clearing_cookie

say 'used, revoked and forged links fail alike (the same error; only the request ID differs)'
fixed=''
for case_ in "used player link:$player_token" "used DM link:$dm_token" "forged token:$(forged_token)"; do
  status=$(redeem "stranger-$STAMP" "${case_#*:}")
  printf '     %s: %s %s\n' "${case_%%:*}" "$status" "$(body)"
  check "${case_%%:*}: 401, no cookie" refused_alike "$status"
  [ -n "$fixed" ] || fixed=$(field '.error | tojson')
  check "${case_%%:*}: the fixed message" is "$(field '.error | tojson')" "$fixed"
done
check 'the fixed message is UNAUTHENTICATED' is "$fixed" \
  '{"code":"UNAUTHENTICATED","message":"Authentication required"}'

say 'the seat is free again; a signed-in browser must confirm before an invitation is spent'
status=$(post dm "/campaigns/$CAMPAIGN/invitations" "{\"characterId\":\"$ELOWEN\",\"expiresHours\":1}")
check 'Elowen can be invited again (201)' is "$status" 201
again_id=$(field .invitationId)
again_token=$(token_of "$(field .link)")
keep "$again_token"
status=$(redeem dm "$again_token")
printf '     the DM browser redeems it: %s %s\n' "$status" "$(body)"
check 'a signed-in browser gets 409 (CONFLICT)' is "$status $(field .error.code)" '409 CONFLICT'
get dm "/campaigns/$CAMPAIGN/invitations" >/dev/null
check '... and the invitation stays pending' is \
  "$(field "[.invitations[] | select(.invitationId == \"$again_id\") | .status] | first")" pending
status=$(post dm "/campaigns/$CAMPAIGN/invitations/$again_id/revoke" '{}')
check 'the DM revokes that invitation' is "$status $(body)" '200 {"status":"revoked"}'
check 'a revoked link fails with the fixed message' is \
  "$(redeem "stranger-$STAMP" "$again_token") $(field '.error | tojson')" "401 $fixed"

say 'cross-site requests are refused through the proxy'
check 'GET /api/auth/session with a foreign Origin: 403' is \
  "$(request dm GET /auth/session - --header 'Origin: https://evil.example')" 403
check '... without touching the cookie' no_cookie_set
check 'the live stream with Sec-Fetch-Site: cross-site: 403' is "$(request dm GET \
  "/campaigns/$CAMPAIGN/live?perspective=DM" - --max-time 5 --header 'Sec-Fetch-Site: cross-site')" 403
check 'sign-out without Origin: 403' is "$(request dm POST /auth/sign-out '{}')" 403
check 'the DM is still signed in' is "$(get dm /auth/session)" 200

say 'the DM signs out'
left=$(now)
check 'POST /api/auth/sign-out: 204' is "$(post dm /auth/sign-out '{}')" 204
check '... and the cookie is cleared' clearing_cookie
if closed=$(arrival dm-stream '^data: {"reason":"unauthenticated"}' 1 3); then
  say "DM stream: closed (unauthenticated) $(since "$closed" "$left") s after signing out"
  check "the DM's stream ended" ended dm-stream 3
else
  check "the DM's stream closed within 3 s" false
fi
check 'GET /api/auth/session: 401' is "$(get dm /auth/session)" 401

say 'no credential in any log of the proxy or the server'
compose logs --no-color proxy server >"$WORK/logs.txt" 2>&1
check "none of the $(wc -l <"$WORK/secrets" | tr -d ' ') credentials in $(wc -l <"$WORK/logs.txt" | tr -d ' ') log lines" \
  logs_clean

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'sign-in journeys passed'

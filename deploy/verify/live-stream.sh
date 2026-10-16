#!/usr/bin/env bash
# live-stream.sh: the live stream (ADR 0033) passes the proxy unbuffered, for an invitation
# session (ADR 0036). LOCAL VERIFICATION (TLS_MODE=internal) of a stack whose review campaign is
# seeded (deploy/scripts/review-campaign.sh). The operator issues a DM invitation (never printed);
# a browser (cookie jar) redeems it through the proxy and opens GET /api/campaigns/ravenford/live
# over HTTP/2 with its cookie and `Origin` (the other accepted form, `Sec-Fetch-Site:
# same-origin`, is sign-in-journey.sh's); the output is watched every 50 ms. One DM command
# through the proxy follows (a new item: the DM perspective reads it). Requires: event-stream
# headers without compression, `ready` promptly, `changed` within 3 s of the command while the
# stream stays open, a heartbeat (13 bytes, every 15 s per process) within 20 s, and after the
# DM signs out, `closed` (unauthenticated) and the end of the stream within 3 s. Prints the
# timeline; exit status 1 on any failure.
source "$(dirname "$0")/../scripts/lib.sh"
source "$(dirname "$0")/http.sh"

say 'the DM signs in with an invitation from the operator (the link is never printed)'
status=$(redeem dm "$(token_of "$(dm_link 1)")")
[ "$status" = 200 ] || die "the DM invitation was refused ($status)"
body
echo

say 'opening the live stream through the proxy (HTTP/2, cookie and Origin)'
opened=$(now)
stream_open dm dm DM --header "Origin: $ORIGIN"
ready=$(arrival dm '^event: ready' 1 15) || die 'no ready frame within 15 s'
say "ready after $(since "$ready" "$opened") s"
sed 's/\r$//' "$WORK/dm.headers"
grep -qi '^content-type: text/event-stream' "$WORK/dm.headers" || die 'not an event stream'
grep -qi '^x-accel-buffering: no' "$WORK/dm.headers" || die 'no x-accel-buffering: no'
! grep -qi '^content-encoding:' "$WORK/dm.headers" || die 'the stream is compressed'
heartbeats=$(grep -c '^: heartbeat' "$WORK/dm.raw" || true)

sleep 2
say 'one DM command through the proxy (a new item: the DM perspective can read it)'
stamp=$(date +%s)
sent=$(now)
status=$(post dm "/campaigns/$CAMPAIGN/commands" "{\"commandId\":\"live-check-$stamp\",
  \"command\":{\"type\":\"CreateEntity\",\"kind\":\"item\",\"name\":\"Проверка потока $stamp\",
  \"existsSince\":null}}")
[ "$status" = 200 ] || die "the command was refused ($status)"
jq -c '{status, commandId}' "$WORK/response.body"
changed=$(arrival dm '^event: changed' 1 3) || die 'no changed frame within 3 s of the command'
say "changed $(since "$changed" "$sent") s after the command, stream open"

say 'waiting for the next heartbeat'
beat=$(arrival dm '^: heartbeat' $((heartbeats + 1)) 20) || die 'no heartbeat within 20 s'
[ ! -s "$WORK/dm.exit" ] || die 'the stream closed'
say "heartbeat $(since "$beat" "$opened") s after opening, stream open"

say 'the DM signs out: the stream closes within one cycle'
left=$(now)
status=$(post dm /auth/sign-out '{}')
[ "$status" = 204 ] || die "sign-out answered $status"
closed=$(arrival dm '^data: {"reason":"unauthenticated"}' 1 3) ||
  die 'no closed (unauthenticated) frame within 3 s of signing out'
end=$(ended dm 3) || die 'the stream stayed open after closed'
say "closed $(since "$closed" "$left") s after signing out; connection ended at $(since "$end" "$left") s"
say 'frames received (raw):'
sed 's/\r$//' "$WORK/dm.raw" | grep -v '^$'
say 'live stream passes the proxy unbuffered'

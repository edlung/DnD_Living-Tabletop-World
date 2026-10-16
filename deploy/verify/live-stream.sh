#!/usr/bin/env bash
# live-stream.sh: the live stream (ADR 0033) passes the proxy unbuffered. LOCAL VERIFICATION ONLY:
# it signs in with the public development DM persona, so the stack must run with
# deploy/verify/dev-personas.yaml and a seeded Ravenford. Opens GET /api/campaigns/ravenford/live
# through Caddy over HTTP/2 with curl writing every byte as it arrives, watches the output every
# 50 ms, creates one item as the DM through the proxy (a change the DM perspective reads), and
# requires: event-stream headers without compression, `ready` promptly, `changed` within 3 s of
# the command while the stream stays open, and a heartbeat (a 13-byte frame, every 15 s per
# process) within 20 s. Prints the timeline; exit status 1 on any failure.
source "$(dirname "$0")/../scripts/lib.sh"
require_env_file
command -v python3 >/dev/null || die 'python3 is needed for sub-second times'

TOKEN=dev-dm-ravenford
host=localhost
port=$(published_port PROXY_HTTPS_PUBLISH 443)
origin="https://$host:$port"
work=$(mktemp -d)
stream_pid=
cleanup() {
  [ -z "$stream_pid" ] || kill "$stream_pid" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

now() { python3 -c 'import time; print(f"{time.time():.3f}")'; }
since() { python3 -c "import sys; print(f'{float(sys.argv[1]) - float(sys.argv[2]):.3f}')" "$1" "$2"; }
compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt >"$work/ca.crt"
api() {
  curl --silent --show-error --cacert "$work/ca.crt" --resolve "$host:$port:127.0.0.1" \
    --header "Authorization: Bearer $TOKEN" "$@"
}
# Waits until the stream holds `count` lines matching `pattern`; prints the time it saw them.
arrival() {
  local pattern=$1 count=$2 seconds=$3
  for _ in $(seq $((seconds * 20))); do
    if [ "$(grep -c "$pattern" "$work/stream.raw" || true)" -ge "$count" ]; then
      now
      return 0
    fi
    kill -0 "$stream_pid" 2>/dev/null || return 1
    sleep 0.05
  done
  return 1
}

say 'opening the live stream through the proxy (HTTP/2)'
: >"$work/stream.raw"
opened=$(now)
# The subshell becomes curl (exec), so $! is curl itself; disowned, its end is not reported.
(exec curl --silent --show-error --cacert "$work/ca.crt" --resolve "$host:$port:127.0.0.1" \
  --header "Authorization: Bearer $TOKEN" --no-buffer --http2 \
  --dump-header "$work/stream.headers" "$origin/api/campaigns/ravenford/live?perspective=DM" \
  >"$work/stream.raw" 2>"$work/curl.err") &
stream_pid=$!
disown "$stream_pid"

ready=$(arrival '^event: ready' 1 15) || die 'no ready frame within 15 s'
say "ready after $(since "$ready" "$opened") s"
sed 's/\r$//' "$work/stream.headers"
grep -qi '^content-type: text/event-stream' "$work/stream.headers" || die 'not an event stream'
grep -qi '^x-accel-buffering: no' "$work/stream.headers" || die 'no x-accel-buffering: no'
! grep -qi '^content-encoding:' "$work/stream.headers" || die 'the stream is compressed'
heartbeats=$(grep -c '^: heartbeat' "$work/stream.raw" || true)

sleep 2
say 'one DM command through the proxy (a new item: the DM perspective can read it)'
stamp=$(date +%s)
sent=$(now)
api --header 'Content-Type: application/json' --data "{\"commandId\":\"live-check-$stamp\",
  \"command\":{\"type\":\"CreateEntity\",\"kind\":\"item\",\"name\":\"Live check $stamp\",
  \"existsSince\":null}}" "$origin/api/campaigns/ravenford/commands"
echo
changed=$(arrival '^event: changed' 1 3) || die 'no changed frame within 3 s of the command'
say "changed $(since "$changed" "$sent") s after the command, stream open"

say 'waiting for the next heartbeat'
beat=$(arrival '^: heartbeat' $((heartbeats + 1)) 20) || die 'no heartbeat within 20 s'
kill -0 "$stream_pid" 2>/dev/null || die 'the stream closed'
say "heartbeat $(since "$beat" "$opened") s after opening, stream open"
say 'frames received (raw):'
sed 's/\r$//' "$work/stream.raw" | grep -v '^$'
say 'live stream passes the proxy unbuffered'

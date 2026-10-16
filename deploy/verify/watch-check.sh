#!/usr/bin/env bash
# watch-check.sh: checks deploy/scripts/watch.sh's restore drill alarms and its webhook on a local
# deployment (local verification only). A drill record that is missing, says failed, or passed
# 9 days ago raises an alarm; one that passed now does not (the records are a throwaway file, via
# LTW_DRILL_LOG). For the run, ALARM_WEBHOOK_URL in deploy/.env points at a throwaway local
# receiver whose path holds a random secret, and is emptied again afterwards (the check refuses to
# run when a webhook is configured). Every alarm must reach the receiver as JSON, and the URL must
# reach curl only on its standard input, never in its arguments, which any user can list: a stub
# `curl` first in PATH records each call's arguments and input, then runs the real curl. A disk
# limit of 0 % makes every run raise disk alarms, so every run posts to the webhook whatever the
# drill record says; the memory limit is lifted. Prints one line per check; exit status 1 if any
# failed. Needs python3 and openssl.
source "$(dirname "$0")/../scripts/lib.sh"
require_env_file
command -v python3 >/dev/null || die 'python3 is needed'
[ -z "$(env_value ALARM_WEBHOOK_URL)" ] ||
  die 'ALARM_WEBHOOK_URL is set: this check replaces it, so run it where no webhook is configured'

work=$(mktemp -d)
receiver=''
# Writes ALARM_WEBHOOK_URL without putting the value on any command line (printf is a builtin).
set_webhook() {
  grep -v '^ALARM_WEBHOOK_URL=' "$ENV_FILE" >"$work/env.next" || true
  printf 'ALARM_WEBHOOK_URL=%s\n' "$1" >>"$work/env.next"
  cat "$work/env.next" >"$ENV_FILE"
  rm -f "$work/env.next"
}
cleanup() {
  [ -z "$receiver" ] || kill "$receiver" 2>/dev/null || true
  set_webhook ''
  rm -rf "$work"
}
trap cleanup EXIT
failures=0

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

# The receiver: every POST's path and body, one line each, in $work/received.
python3 - "$work/port" "$work/received" <<'PY' &
import http.server
import sys

class Hook(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        with open(sys.argv[2], 'ab') as out:
            out.write(self.path.encode() + b' ' + body + b'\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass

server = http.server.HTTPServer(('127.0.0.1', 0), Hook)
with open(sys.argv[1], 'w') as out:
    out.write(str(server.server_address[1]))
server.serve_forever()
PY
receiver=$!
disown "$receiver" # no job notice when it is stopped
for _ in $(seq 50); do
  [ -s "$work/port" ] && break
  sleep 0.1
done
[ -s "$work/port" ] || die 'the webhook receiver did not start'
secret=$(openssl rand -hex 16)
# Searched for from a file, so not even this check passes it as an argument.
printf '%s\n' "$secret" >"$work/secret"
set_webhook "http://127.0.0.1:$(cat "$work/port")/hook/$secret"

real_curl=$(command -v curl)
mkdir "$work/bin" "$work/calls"
cat >"$work/bin/curl" <<STUB
#!/usr/bin/env bash
# Records this call's arguments and standard input, then runs the real curl with both.
call="$work/calls/\$(date +%s)-\$\$"
printf '%s\n' "\$*" >"\$call.args"
tee "\$call.stdin" | "$real_curl" "\$@"
STUB
chmod +x "$work/bin/curl"

# watch.sh with the drill record given (or none); its alarm lines in $work/watch.out.
watch_with_record() {
  if [ -n "$1" ]; then
    printf '%s\n' "$1" >"$work/drill.log"
  else
    rm -f "$work/drill.log"
  fi
  LTW_DRILL_LOG="$work/drill.log" WATCH_ALARM_LOG="$work/alarms.log" WATCH_DISK_PERCENT=0 \
    WATCH_MEMORY_PERCENT=100 PATH="$work/bin:$PATH" "$DEPLOY_DIR/scripts/watch.sh" \
    </dev/null >"$work/watch.out" 2>&1 || true
  grep 'ALARM' "$work/watch.out" | sed 's/^/     /' || true
}
alarmed() { grep -q "ALARM .*$1" "$work/watch.out"; }
no_drill_alarm() { ! grep -q 'ALARM .*restore drill' "$work/watch.out"; }
now=$(date -u +%s)
stamp() { date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

say 'no restore drill recorded'
watch_with_record ''
check 'alarm: no restore drill recorded' alarmed 'no restore drill recorded'
say 'the last drill passed 9 days ago'
watch_with_record "$((now - 9 * 86400)) $(stamp $((now - 9 * 86400))) passed ltw-20261007T000000Z.dump"
check 'alarm: the last restore drill is 9 days old' alarmed 'restore drill is 9 days old'
say 'the last drill failed now'
watch_with_record "$now $(stamp "$now") failed ltw-20261016T000000Z.dump"
check 'alarm: the last restore drill failed' alarmed 'the last restore drill failed'
say 'the last drill passed now'
watch_with_record "$now $(stamp "$now") passed ltw-20261016T000000Z.dump"
check 'no restore drill alarm after a drill that passed now' no_drill_alarm

say 'the webhook'
# The webhook posts carry a JSON body (--data); the readiness probe through the proxy does not.
webhook_calls=$({ grep -l -- '--data' "$work/calls"/*.args 2>/dev/null || true; } | wc -l | tr -d ' ')
printf '     curl calls: %s, of them alarms posted: %s; received: %s\n' \
  "$(find "$work/calls" -name '*.args' | wc -l | tr -d ' ')" "$webhook_calls" \
  "$({ cat "$work/received" 2>/dev/null || true; } | wc -l | tr -d ' ')"
received_all() {
  [ "$webhook_calls" -ge 3 ] && [ -f "$work/received" ] &&
    [ "$(grep -cF -f "$work/secret" "$work/received")" -eq "$webhook_calls" ] &&
    [ "$(grep -c '^/hook/[0-9a-f]* {"text":".* ltw-watch ALARM ' "$work/received")" -eq "$webhook_calls" ]
}
check 'every alarm reached the webhook as JSON {"text": …}' received_all
url_not_in_arguments() { ! grep -qF -f "$work/secret" "$work/calls"/*.args; }
check "the webhook URL is in no curl call's arguments" url_not_in_arguments
url_on_stdin() {
  grep -hF -f "$work/secret" "$work/calls"/*.stdin |
    grep -q '^url = "http://127.0.0.1:[0-9]*/hook/[0-9a-f]*"$'
}
check "curl read the webhook URL from its standard input" url_on_stdin

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'watch checks passed'

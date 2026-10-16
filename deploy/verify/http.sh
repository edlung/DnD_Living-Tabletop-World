# Shared by deploy/verify/*.sh (sourced after ../scripts/lib.sh, never run): HTTPS to the running
# local deployment through its published proxy port, trusting Caddy's local CA (TLS_MODE=internal
# only), with requests shaped as a browser on PUBLIC_ORIGIN sends them. A cookie jar stands for a
# browser. Invitation tokens, links and session cookies never reach the output or a command line:
# request bodies go to curl on stdin, and callers print only `redact`ed text. Bash 3.2 compatible.
require_env_file
for tool in curl jq python3; do
  command -v "$tool" >/dev/null || die "$tool is needed"
done
[ "$(env_value TLS_MODE)" = internal ] || die 'local verification only: needs TLS_MODE=internal'

HOST=$(env_value PUBLIC_HOST)
HTTPS_PORT=$(published_port PROXY_HTTPS_PUBLISH 443)
ORIGIN=$(env_value PUBLIC_ORIGIN)
# The review campaign (apps/server/src/world-engine/review-campaign.ts).
CAMPAIGN=ravenford
WORK=$(mktemp -d)
STREAMS=''
cleanup_http() {
  local pid
  for pid in $STREAMS; do
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  rm -rf "$WORK"
}
trap cleanup_http EXIT

now() { python3 -c 'import time; print(f"{time.time():.3f}")'; }
since() { python3 -c "import sys; print(f'{float(sys.argv[1]) - float(sys.argv[2]):.2f}')" "$1" "$2"; }

# Invitation fragments, session cookies and token fields replaced; everything else as it was.
redact() {
  sed -E 's/#[A-Za-z0-9_-]{43}/#<token>/g; s/(ltw_session=)[A-Za-z0-9_-]{43}/\1<session>/g;
    s/("token":")[A-Za-z0-9_-]{43}/\1<token>/g'
}

# A well-formed token nobody issued (43 base64url characters).
forged_token() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }

compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt >"$WORK/ca.crt"
https() {
  curl --silent --show-error --cacert "$WORK/ca.crt" --resolve "$HOST:$HTTPS_PORT:127.0.0.1" "$@"
}

# request <jar|-> <METHOD> <path under /api> <json body|-> [curl options…]: one request as that
# browser (its cookies read and stored); prints the status. The response is in
# $WORK/response.headers and $WORK/response.body.
request() {
  local jar=$1 method=$2 path=$3 body=$4
  shift 4
  set -- --request "$method" --output "$WORK/response.body" \
    --dump-header "$WORK/response.headers" --write-out '%{http_code}' "$@"
  if [ "$jar" != - ]; then
    touch "$WORK/$jar.jar"
    set -- --cookie "$WORK/$jar.jar" --cookie-jar "$WORK/$jar.jar" "$@"
  fi
  if [ "$body" = - ]; then
    https "$@" "$ORIGIN/api$path"
  else
    printf '%s' "$body" |
      https --header 'Content-Type: application/json' --data-binary @- "$@" "$ORIGIN/api$path"
  fi
}
# A same-origin page: a GET carries fetch metadata and no Origin (browsers send none on a
# same-origin GET); every other method carries Origin.
get() { request "$1" GET "$2" - --header 'Sec-Fetch-Site: same-origin' --header 'Sec-Fetch-Mode: cors'; }
post() {
  request "$1" POST "$2" "$3" --header "Origin: $ORIGIN" --header 'Sec-Fetch-Site: same-origin' \
    --header 'Sec-Fetch-Mode: cors'
}
body() { cat "$WORK/response.body"; }
header() {
  grep -i "^$1:" "$WORK/response.headers" | head -n 1 | cut -d: -f2- | sed 's/^ //; s/\r$//'
}

# The operator's DM invitation for the review campaign (auth:operator dm-invite): its link, a
# secret, on stdout only.
dm_link() {
  server_node "$SERVER_DIST/auth/operator-cli.js" dm-invite --campaign "$CAMPAIGN" \
    --expires-hours "${1:-1}" | jq -r .link
}
token_of() { printf '%s' "${1#*#}"; }
# redeem <jar> <token> [, more JSON fields]: POST /api/auth/redeem as that browser.
redeem() { post "$1" /auth/redeem "{\"token\":\"$2\"${3-}}"; }
# The session token a jar holds (for the log check), or nothing.
session_of() { awk '$6 == "ltw_session" { print $7 }' "$WORK/$1.jar" 2>/dev/null | tail -n 1; }

# stream_open <name> <jar> <perspective> [curl options…]: GET …/live of the review campaign over
# HTTP/2 as that browser, in the background; frames in $WORK/<name>.raw, headers in
# $WORK/<name>.headers, curl's end in $WORK/<name>.exit.
stream_open() {
  local name=$1 jar=$2 perspective=$3
  shift 3
  : >"$WORK/$name.raw"
  (
    set +e
    https --no-buffer --http2 --cookie "$WORK/$jar.jar" --dump-header "$WORK/$name.headers" "$@" \
      "$ORIGIN/api/campaigns/$CAMPAIGN/live?perspective=$perspective" >"$WORK/$name.raw" \
      2>"$WORK/$name.err"
    echo "$?" >"$WORK/$name.exit"
  ) &
  STREAMS="$STREAMS $!"
}
# arrival <name> <pattern> <count> <seconds>: waits until the stream holds `count` lines matching
# `pattern`; prints the time it saw them. Fails at the deadline.
arrival() {
  local name=$1 pattern=$2 count=$3 seconds=$4 _
  for _ in $(seq $((seconds * 20))); do
    if [ "$(grep -c "$pattern" "$WORK/$name.raw" || true)" -ge "$count" ]; then
      now
      return 0
    fi
    sleep 0.05
  done
  return 1
}
# ended <name> <seconds>: waits until the stream's connection ended; prints the time.
ended() {
  local name=$1 seconds=$2 _
  for _ in $(seq $((seconds * 20))); do
    if [ -s "$WORK/$name.exit" ]; then
      now
      return 0
    fi
    sleep 0.05
  done
  return 1
}

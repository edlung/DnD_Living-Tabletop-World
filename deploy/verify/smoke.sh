#!/usr/bin/env bash
# smoke.sh: checks a running local deployment (TLS_MODE=internal) from the host, trusting Caddy's
# local CA for the run (docs/adr/0037-deployment.md, "Local verification"): HTTPS and the HTTP
# redirect, the static client and its caching, security headers, /api/healthz and /api/readyz
# through the proxy, that nothing but the proxy is published, the containers' users and
# read-only filesystems, that the server receives no setting of deploy/.env beyond its own, and
# that the backup service runs this checkout's script. Prints one line per check; exit status 1
# if any failed.
source "$(dirname "$0")/../scripts/lib.sh"
require_env_file

host=$(env_value PUBLIC_HOST)
https_port=$(published_port PROXY_HTTPS_PUBLISH 443)
http_port=$(published_port PROXY_HTTP_PUBLISH 80)
origin="https://$host$([ "$https_port" = 443 ] || printf ':%s' "$https_port")"
CSP="default-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
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
# The value of header $2 in response $1 (first occurrence), without the trailing CR.
header() {
  grep -i "^$2:" "$work/$1.headers" | head -n 1 | cut -d: -f2- | sed 's/^ //; s/\r$//'
}
header_is() { [ "$(header "$1" "$2")" = "$3" ]; }
header_absent() { ! grep -qi "^$2:" "$work/$1.headers"; }
status_is() { head -n 1 "$work/$1.headers" | grep -q " $2"; }
body_has() { grep -qF "$2" "$work/$1.body"; }
encoded() { case $(header "$1" content-encoding) in zstd | gzip) return 0 ;; *) return 1 ;; esac; }

compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt >"$work/ca.crt"
curl_local() {
  curl --silent --show-error --cacert "$work/ca.crt" --resolve "$host:$https_port:127.0.0.1" \
    --resolve "$host:$http_port:127.0.0.1" "$@"
}
fetch() {
  local name=$1 path=$2
  shift 2
  curl_local --dump-header "$work/$name.headers" --output "$work/$name.body" "$@" "$origin$path"
}
# The handshake's transcript; a refused handshake is an answer here, not a failure.
tls() {
  openssl s_client "$@" -connect "127.0.0.1:$https_port" -servername "$host" \
    -CAfile "$work/ca.crt" </dev/null 2>&1 || true
}
tls13() { tls -tls1_3 | grep -q 'Protocol: TLSv1.3'; }
redirects() {
  curl_local --output /dev/null --write-out '%{http_code} %{redirect_url}' \
    "http://$host:$http_port/" | grep -q "^308 https://$host/"
}

say "HTTPS at $origin (Caddy's local CA)"
check 'TLS verifies against the local CA' fetch page /
check 'TLS 1.3 negotiated' tls13
# The client offers TLS 1.1 (its own security level lowered); the server must refuse it.
old_tls=$(tls -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0')
refuses_old_tls() { grep -q 'alert protocol version' <<<"$old_tls"; }
if grep -q 'no protocols available' <<<"$old_tls"; then
  printf 'SKIP  TLS 1.1 refused (this openssl cannot offer TLS 1.1)\n'
else
  check 'TLS 1.1 refused' refuses_old_tls
fi
check 'HTTP redirects to HTTPS' redirects

say 'static client'
check 'page answers 200 with the client' status_is page 200
check 'page is the client' body_has page '<div id="root"></div>'
check 'page is revalidated (no-cache)' header_is page cache-control no-cache
asset=$(grep -o '/assets/[^"]*\.js' "$work/page.body" | head -n 1 || true)
check 'bundle referenced' test -n "$asset"
fetch bundle "${asset:-/assets/none.js}" --compressed
check 'bundle answers 200' status_is bundle 200
check 'bundle is immutable' header_is bundle cache-control 'public, max-age=31536000, immutable'
check 'bundle is compressed' encoded bundle
fetch deep /join
check 'client routes get the page' body_has deep '<div id="root"></div>'
fetch missing /assets/missing.js
check 'a missing bundle is a 404, not the page' status_is missing 404

say 'security headers'
check 'Content-Security-Policy' header_is page content-security-policy "$CSP"
check 'Referrer-Policy no-referrer' header_is page referrer-policy no-referrer
check 'X-Content-Type-Options nosniff' header_is page x-content-type-options nosniff
check 'X-Frame-Options DENY' header_is page x-frame-options DENY
check 'Cross-Origin-Opener-Policy same-origin' header_is page cross-origin-opener-policy same-origin
check 'Permissions-Policy' header_is page permissions-policy \
  'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
check 'no Server header' header_absent page server
if [ "$(env_value TLS_MODE)" = internal ]; then
  check 'no HSTS in local verification' header_absent page strict-transport-security
fi

say 'API through the proxy'
fetch healthz /api/healthz
check '/api/healthz 200' status_is healthz 200
check '/api/healthz ok' body_has healthz '{"status":"ok"}'
fetch readyz /api/readyz
check '/api/readyz 200' status_is readyz 200
check '/api/readyz ready' body_has readyz '{"status":"ready"}'
check 'API answers are never cached' header_is readyz cache-control no-store
# The server's own policy (Stage 340 sets one) or else the proxy's: either way these hold.
api_csp() {
  case $(header readyz content-security-policy) in
    *"default-src 'self'"*"frame-ancestors 'none'"*"base-uri 'none'"*) return 0 ;;
    *) return 1 ;;
  esac
}
check 'API answers carry a CSP' api_csp
check 'API answers carry no Server or Via' sh -c "! grep -qiE '^(server|via):' '$work/readyz.headers'"
fetch knowledge '/api/campaigns/ravenford/knowledge?perspective=PUBLIC'
check 'campaign routes need a credential (401)' status_is knowledge 401

say 'only the proxy is published'
for service in server postgres backup; do
  id=$(compose ps --quiet "$service")
  check "$service publishes no port" sh -c "[ -n '$id' ] && [ -z \"\$(docker port '$id')\" ]"
done
proxy_id=$(compose ps --quiet proxy)
check 'proxy publishes 80/tcp and 443/tcp only' sh -c \
  "[ \"\$(docker port '$proxy_id' | cut -d' ' -f1 | sort -u | tr '\n' ' ')\" = '443/tcp 80/tcp ' ]"

say 'containers'
for service in server proxy backup; do
  id=$(compose ps --quiet "$service")
  check "$service has a read-only root filesystem" sh -c \
    "[ \"\$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' '$id')\" = true ]"
  check "$service runs as a non-root user" sh -c "[ \"\$(docker exec '$id' id -u)\" != 0 ]"
done

say 'settings and scripts'
# The names the server reads (compose.yaml, `server.environment`); any other name of deploy/.env in
# its environment leaked (the host's settings, the database password, the alarm webhook). Names
# only: no value is printed or passed on a command line.
SERVER_SETTINGS=(PUBLIC_ORIGIN LTW_QUESTS_FILE LTW_ALLOW_NEWER_SCHEMA LOG_LEVEL ANTHROPIC_API_KEY
  LTW_AI_MODEL LTW_AI_TIMEOUT_MS DEEPSEEK_API_KEY LTW_DEEPSEEK_MODEL LTW_AI_ROUTES
  LTW_AI_REQUEST_TIMEOUT_MS LTW_AI_APPROVAL_ID LTW_AI_RELEVANCE_BUDGET_MS OPENROUTER_API_KEY
  LTW_ASSET_WORKER_INTERVAL_MS LTW_ASSET_TIMEOUT_MS)
server_setting() {
  local known
  for known in "${SERVER_SETTINGS[@]}"; do
    [ "$known" != "$1" ] || return 0
  done
  return 1
}
server_id=$(compose ps --quiet server)
docker inspect "$server_id" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | sort -u >"$work/server.names"
leaked=''
for name in $(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$ENV_FILE" | sort -u); do
  if ! server_setting "$name" && grep -qx "$name" "$work/server.names"; then
    leaked="$leaked $name"
  fi
done
printf '     deploy/.env settings in the server beyond its own:%s\n' "${leaked:- none}"
check 'the server receives no other setting of deploy/.env' test -z "$leaked"
backup_id=$(compose ps --quiet backup)
labelled_for_checkout() {
  [ "$(docker inspect "$backup_id" --format '{{index .Config.Labels "ltw.backup-script"}}')" = \
    "$(backup_script_digest)" ]
}
sees_checkout_script() {
  [ "$(docker exec "$backup_id" sha256sum /opt/ltw/backup.sh | cut -d' ' -f1)" = \
    "$(openssl dgst -sha256 -r "$DEPLOY_DIR/backup/backup.sh" | cut -d' ' -f1)" ]
}
check "the backup service was created for this checkout's deploy/backup/ (label)" labelled_for_checkout
check "the backup service reads this checkout's backup.sh" sees_checkout_script

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'smoke checks passed'

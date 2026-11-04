#!/usr/bin/env bash
# local-mode.sh: checks the laptop's stack (deploy/local/ltw-local.sh; docs/adr/0061-local-mode.md)
# from this host, with LTW_ENV_FILE=deploy/local/.env and the stack started on an address this host
# reaches (for a check on this machine alone: `ltw-local.sh start --address 127.0.0.1`):
# - the trust page over plain HTTP: the page, its script, its policy, no caching, and the laptop's
#   root certificate as a download, a CA named "Living Tabletop World local root";
# - HTTPS on the address: the chain verifies against that root alone for the IP address, with no
#   server name sent (as a phone opening the address does), and the server is ready through it;
# - a campaign's move on this server and back: exported for a move it is away, a change is 409
#   MOVED, the package comes home again and the campaign is at home (it needs a campaign: run
#   `ltw-local.sh first-dm` once, which seeds `ravenford`).
# Prints one line per check; exit status 1 if any failed.
source "$(dirname "$0")/../scripts/lib.sh"
[ -n "${LTW_ENV_FILE:-}" ] || die 'run with LTW_ENV_FILE=deploy/local/.env'
require_env_file

address=$(env_value PUBLIC_HOST)
campaign=${LTW_CHECK_CAMPAIGN:-ravenford}
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
header_has() { grep -qi "^$2:.*$3" "$work/$1.headers"; }
status_is() { head -n 1 "$work/$1.headers" | grep -q " $2"; }
plain() {
  local name=$1 path=$2
  curl --silent --show-error --dump-header "$work/$name.headers" --output "$work/$name.body" \
    "http://$address$path"
}

plain page /
plain script /trust.js
plain root /ltw-local-root.crt
check 'trust page: 200, no caching' status_is page 200
check 'trust page: no-store' header_has page cache-control no-store
check 'trust page: its policy names the HTTPS address' header_has page content-security-policy "connect-src https://$address"
check 'trust page: the steps in Russian and English' grep -q 'Living Tabletop World local root' "$work/page.body"
check 'trust page: its script' status_is script 200
check 'root: served as a CA certificate' header_has root content-type application/x-x509-ca-cert
check 'root: a download named ltw-local-root.crt' header_has root content-disposition ltw-local-root.crt
check 'root: Living Tabletop World local root' sh -c "openssl x509 -in '$work/root.body' -noout -subject | grep -q 'Living Tabletop World local root'"
check 'root: a CA' sh -c "openssl x509 -in '$work/root.body' -noout -text | grep -q 'CA:TRUE'"
check 'trust page: nothing of the API over HTTP' sh -c "! curl -s 'http://$address/api/healthz' | grep -q '\"ok\"'"

# What a phone sees: no server name, the root alone as the anchor.
openssl s_client -connect "$address:443" -CAfile "$work/root.body" -verify_return_error \
  -verify_ip "$address" </dev/null >"$work/tls.txt" 2>&1 || true
check 'HTTPS: the chain verifies against the root for the address' grep -q 'Verify return code: 0 (ok)' "$work/tls.txt"
check 'HTTPS: ready through the proxy' curl --silent --fail --cacert "$work/root.body" "https://$address/api/readyz"

origin="https://$address"
change() {
  curl --silent --cacert "$work/root.body" --output "$work/change.body" --write-out '%{http_code}' \
    --header "Origin: $origin" --header 'content-type: application/json' \
    --data '{"mode":"online"}' "$origin/api/campaigns/$campaign/lobby?perspective=DM"
}
"$DEPLOY_DIR/scripts/campaign-move.sh" export "$campaign" --move 'local check' >"$work/package.gz" 2>"$work/export.txt"
check 'move: exported' grep -q '"move":true' "$work/export.txt"
check 'move: away here' sh -c "'$DEPLOY_DIR/scripts/campaign-move.sh' status '$campaign' 2>&1 | grep -q 'local check'"
code=$(change)
check 'move: a change is 409 MOVED' sh -c "[ '$code' = 409 ] && grep -q MOVED '$work/change.body'"
"$DEPLOY_DIR/scripts/campaign-move.sh" import <"$work/package.gz" >"$work/import.out" 2>"$work/import.txt"
check 'move: the package comes home' grep -q '"outcome":"returned"' "$work/import.txt"
check 'move: at home again' sh -c "'$DEPLOY_DIR/scripts/campaign-move.sh' status '$campaign' 2>&1 | grep -q '\"away\":null'"

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'local mode: all checks passed'

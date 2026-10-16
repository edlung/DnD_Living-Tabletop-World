#!/usr/bin/env bash
# proxy-contract.sh <tag>: what ltw-proxy:<tag> forwards and returns, against a stand-in server
# (a Node echo on ltw-server:<tag>) on a private network with nothing published; the requests are
# made from inside the proxy container. Checks: /api reaches the server without its prefix, with
# Host, Origin, Sec-Fetch-*, Cookie and Authorization unchanged (the origin check and sign-in of
# ADR 0036 need them); a client's forged X-Forwarded-For is replaced by the real peer; the server's
# own Content-Security-Policy is kept and the proxy's added elsewhere. Exit status 1 on a failure.
set -euo pipefail
tag=${1:?usage: proxy-contract.sh <tag>}
name="ltw-proxy-check-$$"
SERVER_CSP="default-src 'none'; sandbox"
ECHO="require('node:http').createServer((q, s) => {
  s.setHeader('content-security-policy', \"$SERVER_CSP\");
  const h = q.headers;
  s.end(['url=' + q.url, 'host=' + h.host, 'origin=' + h.origin, 'sec-fetch-site=' +
    h['sec-fetch-site'], 'sec-fetch-mode=' + h['sec-fetch-mode'], 'cookie=' + h.cookie,
    'authorization=' + h.authorization, 'x-forwarded-for=' + h['x-forwarded-for'], ''].join('\n'));
}).listen(3000);"
cleanup() {
  docker rm --force "$name-proxy" "$name-server" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
failures=0
check() {
  if [ "$2" = "$3" ]; then
    printf 'PASS  %s\n' "$1"
  else
    printf 'FAIL  %s (expected %s, got %s)\n' "$1" "$3" "$2"
    failures=$((failures + 1))
  fi
}

docker network create --internal "$name" >/dev/null
docker run --detach --name "$name-server" --network "$name" --network-alias server \
  --entrypoint node "ltw-server:$tag" -e "$ECHO" >/dev/null
docker run --detach --name "$name-proxy" --network "$name" --env PUBLIC_HOST=localhost \
  --env TLS_MODE=internal --sysctl net.ipv4.ip_unprivileged_port_start=0 "ltw-proxy:$tag" >/dev/null
for _ in $(seq 50); do
  docker exec "$name-proxy" wget -q -O /dev/null http://127.0.0.1:2020/healthz 2>/dev/null && break
  sleep 0.2
done
request() {
  docker exec "$name-proxy" wget -S -q -O - --no-check-certificate \
    --header 'Origin: https://localhost' --header 'Sec-Fetch-Site: same-origin' \
    --header 'Sec-Fetch-Mode: cors' --header 'Cookie: ltw_session=opaque-test-value' \
    --header 'Authorization: Bearer opaque-test-token' \
    --header 'X-Forwarded-For: 203.0.113.66' "https://localhost$1" 2>&1
}
field() { sed -n "s/^$1=//p" <<<"$api"; }
policy() { sed -n 's/^ *[Cc]ontent-[Ss]ecurity-[Pp]olicy: //p' <<<"$1"; }

api=$(request '/api/live?perspective=DM')
check 'prefix stripped' "$(field url)" '/live?perspective=DM'
check 'Host kept' "$(field host)" 'localhost'
check 'Origin forwarded' "$(field origin)" 'https://localhost'
check 'Sec-Fetch-Site forwarded' "$(field sec-fetch-site)" 'same-origin'
check 'Sec-Fetch-Mode forwarded' "$(field sec-fetch-mode)" 'cors'
check 'Cookie forwarded' "$(field cookie)" 'ltw_session=opaque-test-value'
check 'Authorization forwarded' "$(field authorization)" 'Bearer opaque-test-token'
# The request came from the proxy container's loopback (IPv4 or IPv6), never 203.0.113.66.
peer=$(field x-forwarded-for)
case $peer in 127.0.0.1 | ::1) peer=loopback ;; esac
check 'forged X-Forwarded-For replaced by the real peer' "$peer" loopback
check "the server's own CSP kept" "$(policy "$api")" "$SERVER_CSP"
page=$(request /)
check "the proxy's CSP on the client" "$(policy "$page" | cut -d';' -f1)" "default-src 'self'"

[ "$failures" -eq 0 ] || { echo "$failures proxy contract check(s) failed" >&2; exit 1; }
echo 'proxy contract checks passed'

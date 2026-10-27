#!/usr/bin/env bash
# trust-boundary.sh: the server's network trust boundary in a running deployment
# (docs/adr/0037-deployment.md, part B notes). The server joins `backend` (internal, no address on
# the host: gateway mode isolated; the proxy is the only other member), `data` (internal,
# isolated) and `egress` (its outbound calls only), listens only at its backend address, and
# trusts X-Forwarded-For from the backend range alone (LTW_TRUST_PROXY). Checks, one line each:
#   topology    the members and flags of every network, the pinned range, the server's address,
#               its settings and its listening socket;
#   reachable   from the host's network namespace and from the edge network nothing reaches the
#               API (backend, data and egress addresses, the service name), from the egress
#               network its address refuses the port; controls: the probes reach the proxy, and
#               the proxy reaches the server;
#   forwarded   redeems through the proxy, each with another forged X-Forwarded-For, are one
#               client to the limits (429 by the eleventh); the same header from a trusted peer
#               (inside the proxy) names a new client (control).
# Probes are throwaway containers of the server image (node), never published, never kept.
# Safe on a server too; the forwarded check spends a minute of the host's own redeem budget, so
# run it after sign-in-journey.sh. Exit status 1 if any check failed.
source "$(dirname "$0")/../scripts/lib.sh"
require_env_file
command -v jq >/dev/null || die 'jq is needed'

server=$(compose ps -q server)
proxy=$(compose ps -q proxy)
[ -n "$server" ] && [ -n "$proxy" ] || die 'the stack is not running'
project=$(docker inspect "$server" --format '{{index .Config.Labels "com.docker.compose.project"}}')
tag=$(env_value LTW_IMAGE_TAG)
prefix=$(env_value LTW_BACKEND_PREFIX)
prefix=${prefix:-10.231.251}
host=$(env_value PUBLIC_HOST)
port=$(published_port PROXY_HTTPS_PUBLISH 443)
origin=$(env_value PUBLIC_ORIGIN)
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
is() { [ "$1" = "$2" ]; }
net() { printf '%s_%s' "$project" "$1"; }
# The compose services attached to a network of this project, sorted.
members() {
  docker network inspect "$(net "$1")" --format '{{range $id, $c := .Containers}}{{$id}} {{end}}' |
    xargs -r -n 1 docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' |
    sort | tr '\n' ' ' | sed 's/ $//'
}
# internal, gateway mode, range and host address of a network (Docker prints a missing
# address as "invalid IP", older Engines as nothing: here `none`).
facts() {
  docker network inspect "$(net "$1")" --format '{{.Internal}} {{index .Options "com.docker.network.bridge.gateway_mode_ipv4"}} {{range .IPAM.Config}}{{.Subnet}} host={{.Gateway}}{{end}}' |
    sed -e 's/host=invalid IP$/host=none/' -e 's/host=$/host=none/'
}
address() { docker inspect "$1" --format "{{(index .NetworkSettings.Networks \"$(net "$2")\").IPAddress}}"; }
# A setting of the server container; never prints any other.
setting() { docker inspect "$server" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }

PROBE="const net = require('node:net');
const probe = (target) => new Promise((resolve) => {
  const at = target.lastIndexOf(':');
  const socket = net.connect({ host: target.slice(0, at), port: Number(target.slice(at + 1)) });
  const done = (verdict) => { socket.destroy(); resolve(target + ' ' + verdict); };
  socket.setTimeout(3000, () => done('timeout'));
  socket.once('connect', () => done('open'));
  socket.once('error', (e) => done(e.code === 'ECONNREFUSED' ? 'refused' : e.code === 'ENOTFOUND' ? 'no-such-name' : e.code));
});
Promise.all(process.argv.slice(1).map(probe)).then((lines) => console.log(lines.join('\n')));"
# probe <network> <host:port>…: one TCP connection to each from a throwaway container.
probe() {
  local network=$1
  shift
  docker run --rm --network "$network" --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --entrypoint node "ltw-server:$tag" -e "$PROBE" -- "$@"
}
verdict() { sed -n "s/^$(printf '%s' "$2" | sed 's/[.]/[.]/g') //p" "$work/$1"; }
closed() { [ "$(verdict "$1" "$2")" != open ] && [ -n "$(verdict "$1" "$2")" ]; }
isolated_internal() { case $(facts "$1") in 'true isolated '*' host=none') return 0 ;; *) return 1 ;; esac; }
limited() { case $codes in *429) return 0 ;; *) return 1 ;; esac; }
new_client() { case $trusted in *401*) return 0 ;; *) return 1 ;; esac; }

say "topology of project $project"
for name in edge backend data egress; do
  printf '     %-8s %s | %s\n' "$name" "$(facts "$name")" "$(members "$name")"
done
check 'backend: internal, no host address (isolated), the pinned range' is "$(facts backend)" \
  "true isolated $prefix.0/24 host=none"
check 'backend: the proxy and the server only' is "$(members backend)" 'proxy server'
check 'data: internal, no host address (isolated)' isolated_internal data
check 'data: the server, the database and the backups only' is "$(members data)" 'backup postgres server'
check 'edge: the proxy only' is "$(members edge)" proxy
check 'egress: the server only' is "$(members egress)" server
check "the server's backend address is $prefix.10" is "$(address "$server" backend)" "$prefix.10"
check 'HTTP_HOST is that address' is "$(setting HTTP_HOST)" "$prefix.10"
check 'LTW_TRUST_PROXY is the backend range' is "$(setting LTW_TRUST_PROXY)" "$prefix.0/24"
listeners=$(compose exec -T server node -e "const fs = require('node:fs');
const v4 = (h) => [3, 2, 1, 0].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)).join('.');
const out = [];
for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const line of text.trim().split('\n').slice(1)) {
    const [, local, , state] = line.trim().split(/\s+/);
    if (state !== '0A') continue;
    const [hex, port] = local.split(':');
    const host = hex.length === 8 ? v4(hex) : !/[^0]/.test(hex) ? '::' : hex.startsWith('0000000000000000FFFF0000') ? v4(hex.slice(24)) : 'v6:' + hex;
    out.push(host + ':' + parseInt(port, 16));
  }
}
console.log(out.filter((entry) => entry.endsWith(':3000')).sort().join(' '));")
printf '     listening on port 3000: %s\n' "$listeners"
check 'the API listens only at the backend address' is "$listeners" "$prefix.10:3000"

say 'reachable: nothing but the proxy reaches the API'
data_ip=$(address "$server" data)
egress_ip=$(address "$server" egress)
proxy_edge=$(address "$proxy" edge)
probe host "$prefix.10:3000" "$data_ip:3000" "$egress_ip:3000" "$proxy_edge:443" >"$work/host"
sed 's/^/     host namespace: /' "$work/host"
check 'from the host: the backend address' closed host "$prefix.10:3000"
check 'from the host: the data address' closed host "$data_ip:3000"
check 'from the host: the egress address' closed host "$egress_ip:3000"
check 'control: the host reaches the proxy' is "$(verdict host "$proxy_edge:443")" open
probe "$(net edge)" server:3000 "$prefix.10:3000" "$data_ip:3000" "$egress_ip:3000" proxy:443 >"$work/edge"
sed 's/^/     edge network:   /' "$work/edge"
# Docker's DNS on the edge network does not know `server`; a host resolver it forwards to may
# still answer the bare name (the hosted runner's does), so the guarantee is that nothing answers.
check 'from the edge network: the service name' closed edge server:3000
check 'from the edge network: the backend address' closed edge "$prefix.10:3000"
check 'from the edge network: the data address' closed edge "$data_ip:3000"
check 'from the edge network: the egress address' closed edge "$egress_ip:3000"
check 'control: the edge network reaches the proxy' is "$(verdict edge proxy:443)" open
probe "$(net egress)" server:3000 "$egress_ip:3000" >"$work/egress"
sed 's/^/     egress network: /' "$work/egress"
check "from the egress network: the server's port is closed" is "$(verdict egress "$egress_ip:3000")" refused
check 'control: the proxy reaches the server' is \
  "$(docker exec "$proxy" wget -q -O - http://server:3000/healthz 2>&1)" '{"status":"ok"}'

say 'forwarded: a client cannot choose the address it is limited as'
ca=()
if [ "$(env_value TLS_MODE)" = internal ]; then
  compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt >"$work/ca.crt"
  ca=(--cacert "$work/ca.crt")
fi
forged() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }
codes=''
for i in $(seq 11); do
  status=$(printf '{"token":"%s"}' "$(forged)" | curl --silent --show-error ${ca[@]+"${ca[@]}"} \
    --resolve "$host:$port:127.0.0.1" --output /dev/null --write-out '%{http_code}' \
    --header "Origin: $origin" --header 'Content-Type: application/json' \
    --header "X-Forwarded-For: 203.0.113.$i" --data-binary @- "$origin/api/auth/redeem")
  codes="$codes $status"
  [ "$status" != 429 ] || break
done
printf '     through the proxy, X-Forwarded-For 203.0.113.1, .2, …:%s\n' "$codes"
check 'one client to the limits: 429 by the eleventh redeem' limited
trusted=$(docker exec "$proxy" wget -q -O /dev/null --header "Origin: $origin" \
  --header 'Content-Type: application/json' --header "X-Forwarded-For: 198.51.100.$((RANDOM % 250 + 1))" \
  --post-data "{\"token\":\"$(forged)\"}" http://server:3000/auth/redeem 2>&1 || true)
printf '     from the proxy (trusted peer), a forged X-Forwarded-For: %s\n' "$trusted"
check 'control: from a trusted peer the header names a new client (401, not 429)' new_client

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'trust boundary checks passed'

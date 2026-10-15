#!/usr/bin/env bash
# csp-precedence.sh <tag>: the proxy keeps a Content-Security-Policy the server set (the asset
# content route's is stricter, ADR 0022) and adds its own everywhere else. Runs ltw-proxy:<tag>
# against a stand-in upstream that answers with its own policy, on a private network with nothing
# published, and asks from inside the proxy container. Exit status 1 if either answer is wrong.
set -euo pipefail
tag=${1:?usage: csp-precedence.sh <tag>}
image="ltw-proxy:$tag"
name="ltw-csp-check-$$"
UPSTREAM_CSP="default-src 'none'; sandbox"
cleanup() {
  docker rm --force "$name-proxy" "$name-upstream" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create --internal "$name" >/dev/null
docker run --detach --name "$name-upstream" --network "$name" --network-alias server \
  --entrypoint caddy "$image" respond --listen :3000 \
  --header "Content-Security-Policy: $UPSTREAM_CSP" --body upstream >/dev/null
docker run --detach --name "$name-proxy" --network "$name" --env PUBLIC_HOST=localhost \
  --env TLS_MODE=internal --sysctl net.ipv4.ip_unprivileged_port_start=0 "$image" >/dev/null
for _ in $(seq 50); do
  docker exec "$name-proxy" wget -q -O /dev/null http://127.0.0.1:2020/healthz 2>/dev/null && break
  sleep 0.2
done
policy() {
  docker exec "$name-proxy" wget -S -q --no-check-certificate -O /dev/null "https://localhost$1" \
    2>&1 | sed -n 's/^ *[Cc]ontent-[Ss]ecurity-[Pp]olicy: //p'
}
api=$(policy /api/content)
page=$(policy /)
printf 'upstream policy kept on /api: %s\n' "$api"
printf 'proxy policy on the client:   %s\n' "$page"
[ "$api" = "$UPSTREAM_CSP" ] || { echo 'FAIL: the proxy replaced the server policy' >&2; exit 1; }
case $page in "default-src 'self';"*) ;; *) echo 'FAIL: no proxy policy' >&2; exit 1 ;; esac
echo 'csp precedence check passed'

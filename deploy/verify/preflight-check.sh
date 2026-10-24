#!/usr/bin/env bash
# preflight-check.sh: the guards deploy.sh and ci.sh run before they change anything
# (deploy/RUNBOOK.md, section 1). On Docker Engine 27 both refuse, naming the Engine, after
# `docker version` alone (a stub `docker` first in PATH answers it and records every call, so
# nothing is touched). A project whose `backend` network gives the host an address is refused
# (a throwaway project's networks, created here and removed), and, when this deployment runs, its
# `backend` and `data` networks pass. Safe on a server too. Prints one line per check; exit
# status 1 if any failed.
source "$(dirname "$0")/../scripts/lib.sh"

work=$(mktemp -d)
probe="ltwpreflight$$"
cleanup() {
  docker network rm "${probe}_backend" "${probe}_data" >/dev/null 2>&1 || true
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

say 'Docker Engine 27 (a stub answers `docker version`; any other call fails and is recorded)'
mkdir "$work/bin"
cat >"$work/bin/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"$work/docker-calls"
case \${1:-} in
  version) echo 27.5.1 ;;
  *) echo "stub docker: \$1 refused" >&2; exit 99 ;;
esac
STUB
chmod +x "$work/bin/docker"
# <script> <argument>…: refused, naming the Engine, after `docker version` and nothing else.
refuses_old_engine() {
  : >"$work/docker-calls"
  if PATH="$work/bin:$PATH" "$@" >"$work/out" 2>&1; then
    return 1
  fi
  grep -q 'Docker Engine 27.5.1: 28 or later is required' "$work/out" &&
    [ "$(cut -d' ' -f1 "$work/docker-calls" | sort -u)" = version ]
}
check 'deploy.sh refuses Docker Engine 27 before any other Docker call' \
  refuses_old_engine "$DEPLOY_DIR/scripts/deploy.sh" 000000000000
sed 's/^/     /' "$work/out"
check 'ci.sh refuses Docker Engine 27 before any other Docker call' \
  refuses_old_engine "$DEPLOY_DIR/verify/ci.sh"
sed 's/^/     /' "$work/out"
check 'this host runs Docker Engine 28 or later' require_docker_engine

say 'a Compose that cannot read compose.yaml uninterpolated (a stub, as older Compose answers)'
mkdir "$work/old-compose"
cat >"$work/old-compose/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"$work/docker-calls"
case "\$*" in
  version*) echo 29.0.0 ;;
  'image inspect '*) echo '[]' ;;
  'compose config --no-interpolate --format json')
    echo 'invalid spec: \${BACKUP_DIR:?set BACKUP_DIR in deploy/.env}:/backups:ro: too many colons' >&2
    exit 15 ;;
  'compose config --format json')
    if [ "\${STUB_RESOLVED:-}" = yes ]; then printf '{\n  "name": "ltw-stub",\n  "services": {}\n}\n'; exit 0; fi
    echo 'stub docker: unresolved' >&2; exit 15 ;;
  *) echo "stub docker: \$* refused" >&2; exit 99 ;;
esac
STUB
chmod +x "$work/old-compose/docker"
reads_resolved_project() {
  [ "$(STUB_RESOLVED=yes PATH="$work/old-compose:$PATH" project_name 2>/dev/null)" = ltw-stub ]
}
check 'the project is read from the resolved configuration when Compose rejects the uninterpolated one' \
  reads_resolved_project
# deploy.sh needs its settings file; where there is one (CI, a server) it must stop before it
# writes or changes anything, never reading "no database" and skipping the backup.
stops_without_project() {
  : >"$work/docker-calls"
  if STUB_RESOLVED=no PATH="$work/old-compose:$PATH" "$DEPLOY_DIR/scripts/deploy.sh" 000000000000 \
    >"$work/out" 2>&1; then
    return 1
  fi
  grep -q 'cannot tell the Compose project' "$work/out" && ! grep -q 'no database yet' "$work/out" &&
    ! grep -Eq '^compose (up|down|create|exec|run|stop|ps)|^volume' "$work/docker-calls"
}
if [ -f "$ENV_FILE" ]; then
  digest_before=$(openssl dgst -sha256 -r "$ENV_FILE")
  check 'deploy.sh stops before any change when it cannot tell its Compose project' stops_without_project
  sed 's/^/     /' "$work/out"
  unchanged_env() { [ "$(openssl dgst -sha256 -r "$ENV_FILE")" = "$digest_before" ]; }
  check 'and leaves deploy/.env as it was' unchanged_env
fi

say "networks: a throwaway project $probe whose backend gives the host an address"
docker network create --internal "${probe}_backend" >/dev/null
docker network create --internal --opt com.docker.network.bridge.gateway_mode_ipv4=isolated \
  "${probe}_data" >/dev/null
for name in backend data; do
  printf '     %s_%s: %s\n' "$probe" "$name" "$(docker network inspect "${probe}_$name" \
    --format '{{.Internal}} {{index .Options "com.docker.network.bridge.gateway_mode_ipv4"}} {{json .IPAM.Config}}')"
done
refuses_host_address() {
  if (require_isolated_networks "$probe") >"$work/out" 2>&1; then
    return 1
  fi
  grep -q "${probe}_backend gives the host an address" "$work/out"
}
check 'a backend network with a host address is refused' refuses_host_address
sed 's/^/     /' "$work/out"
docker network rm "${probe}_backend" >/dev/null
docker network create --internal --opt com.docker.network.bridge.gateway_mode_ipv4=isolated \
  "${probe}_backend" >/dev/null
accepts_isolated() { (require_isolated_networks "$probe"); }
check 'isolated internal backend and data networks pass' accepts_isolated

if [ -f "$ENV_FILE" ] && [ -n "$(compose ps --quiet server 2>/dev/null)" ]; then
  project=$(project_name)
  say "this deployment ($project)"
  deployment_isolated() { (require_isolated_networks "$project"); }
  check "this deployment's backend and data networks give the host no address" deployment_isolated
fi

[ "$failures" -eq 0 ] || die "$failures check(s) failed"
say 'preflight checks passed'

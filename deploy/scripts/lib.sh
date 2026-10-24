# Shared by deploy/scripts/*.sh (sourced, never run). Compose runs in deploy/, so it reads
# compose.yaml and deploy/.env there (and COMPOSE_FILE from that file, if a verification override
# is configured). No helper here reads or prints a secret.
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_DIR=$(cd "$DEPLOY_DIR/.." && pwd)
ENV_FILE="$DEPLOY_DIR/.env"
SERVER_DIST=apps/server/dist
# The restore drill's verdicts, one line each: `<epoch> <UTC time> passed|failed <dump>`.
# restore-drill.sh appends, watch.sh alarms on the last; git-ignored, like every *.log.
DRILL_LOG=${LTW_DRILL_LOG:-$DEPLOY_DIR/restore-drill.log}
# Docker Engine 28 added the bridge gateway mode `isolated` (no host address on a network).
DOCKER_ENGINE_MINIMUM=28

compose() {
  (cd "$DEPLOY_DIR" && docker compose "$@")
}

die() {
  printf '%s: %s\n' "$(basename "$0")" "$*" >&2
  exit 1
}

say() {
  printf '==> %s\n' "$*"
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "no $ENV_FILE: copy deploy/.env.example and fill it in (deploy/RUNBOOK.md)"
}

# A non-secret setting from deploy/.env (the last assignment wins, as in Compose).
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

# The host port of a published proxy port setting (`[address:]port`), or the default given.
published_port() {
  local value
  value=$(env_value "$1")
  value=${value##*:}
  echo "${value:-$2}"
}

# Sets a non-secret setting in deploy/.env in place, keeping the file's mode and owner.
set_env_value() {
  local name=$1 value=$2 next
  next=$(mktemp)
  if grep -q "^$name=" "$ENV_FILE"; then
    sed "s|^$name=.*|$name=$value|" "$ENV_FILE" >"$next"
  else
    cat "$ENV_FILE" >"$next"
    printf '%s=%s\n' "$name" "$value" >>"$next"
  fi
  cat "$next" >"$ENV_FILE"
  rm -f "$next"
}

# Runs a node program of the server image inside the running server container.
server_node() {
  compose exec -T server node "$@"
}

service_running() {
  compose ps --status running --services 2>/dev/null | grep -qx "$1"
}

# The Compose project of this deployment (COMPOSE_PROJECT_NAME, else compose.yaml's `name`), as
# Compose resolves it: without interpolation first, so it needs no setting; an older Compose (the
# hosted CI runner's) rejects the uninterpolated `${BACKUP_DIR:?…}` mounts ("too many colons"),
# and then the resolved configuration is read. Only the name leaves; no value is printed. Callers
# take it in a plain assignment (`project=$(project_name)`), which stops the script when it fails.
project_name() {
  local name
  name=$({ compose config --no-interpolate --format json 2>/dev/null ||
    compose config --format json; } | sed -n 's/^  "name": "\([^"]*\)",$/\1/p' | head -n 1)
  [ -n "$name" ] || die 'cannot tell the Compose project (docker compose config)'
  echo "$name"
}

# database_exists <project>: whether that project's database volume exists. A failure to list the
# volumes stops the script: it never reads as "no database", which would skip the backup first.
database_exists() {
  local volumes
  [ -n "${1:-}" ] || die 'database_exists: no Compose project'
  volumes=$(docker volume ls --quiet --filter "label=com.docker.compose.project=$1" \
    --filter label=com.docker.compose.volume=pgdata) || die 'cannot list the Docker volumes'
  [ -n "$volumes" ]
}

# The digest of deploy/backup/ (names and contents), which compose.yaml puts on the backup
# service's label `ltw.backup-script` (deploy.sh writes it as LTW_BACKUP_SCRIPT_DIGEST).
backup_script_digest() {
  local file
  (
    cd "$DEPLOY_DIR/backup"
    for file in $(find . -type f | LC_ALL=C sort); do
      printf '%s\n' "$file"
      cat "$file"
    done
  ) | openssl dgst -sha256 -r | cut -c1-64
}

# The full commit of a revision in this checkout, or nothing.
commit_of() {
  git -C "$REPO_DIR" rev-parse --verify --quiet "$1^{commit}" 2>/dev/null || true
}

# Docker Engine 28 or later: `backend` and `data` use the bridge gateway mode `isolated`, so the
# host has no address on them. An older Engine ignores the mode and gives the host an address
# inside the range the server trusts (deploy/RUNBOOK.md, section 1).
require_docker_engine() {
  local version major
  version=$(docker version --format '{{.Server.Version}}' 2>/dev/null) ||
    die 'the Docker Engine does not answer (docker version)'
  major=${version%%.*}
  case $major in
    '' | *[!0-9]*) die "cannot read the Docker Engine version: '$version'" ;;
  esac
  [ "$major" -ge "$DOCKER_ENGINE_MINIMUM" ] ||
    die "Docker Engine $version: $DOCKER_ENGINE_MINIMUM or later is required (isolated internal networks; deploy/RUNBOOK.md section 1)"
}

# The project's internal networks give the host no address: internal, gateway mode `isolated`,
# no gateway in their address plan (`docker network inspect`). Dies naming the first that fails.
require_isolated_networks() {
  local project=$1 name facts
  for name in backend data; do
    facts=$(docker network inspect "${project}_$name" --format \
      '{{.Internal}} {{index .Options "com.docker.network.bridge.gateway_mode_ipv4"}} {{json .IPAM.Config}}' \
      2>/dev/null) || die "network ${project}_$name does not exist"
    case $facts in
      *'"Gateway":"'[!\"]*)
        die "network ${project}_$name gives the host an address ($facts): the host could reach the server inside the range it trusts; Docker Engine $DOCKER_ENGINE_MINIMUM+ with gateway mode isolated is required (deploy/RUNBOOK.md section 1)"
        ;;
      'true isolated '*) ;;
      *) die "network ${project}_$name is not internal with gateway mode isolated ($facts) (deploy/RUNBOOK.md section 1)" ;;
    esac
  done
}

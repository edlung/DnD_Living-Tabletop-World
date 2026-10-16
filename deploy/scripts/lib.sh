# Shared by deploy/scripts/*.sh (sourced, never run). Compose runs in deploy/, so it reads
# compose.yaml and deploy/.env there (and COMPOSE_FILE from that file, if a verification override
# is configured). No helper here reads or prints a secret.
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO_DIR=$(cd "$DEPLOY_DIR/.." && pwd)
ENV_FILE="$DEPLOY_DIR/.env"
SERVER_DIST=apps/server/dist

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

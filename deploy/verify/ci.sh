#!/usr/bin/env bash
# ci.sh: the deployment check of hosted CI (and of any clean checkout with Docker): builds the
# images of HEAD, writes a throwaway deploy/.env (random password, localhost, internal TLS,
# backups in a temporary directory), starts the stack, seeds Ravenford, and runs the smoke checks,
# a backup and the restore drill, the retention and proxy contract checks and, with the
# development personas, the live stream check. Removes every container, volume and file it
# created, whatever happens.
# Refuses to run when deploy/.env exists. Ports: LTW_CI_HTTP_PORT and LTW_CI_HTTPS_PORT
# (default 80 and 443, bound to 127.0.0.1).
source "$(dirname "$0")/../scripts/lib.sh"
[ ! -e "$ENV_FILE" ] || die 'deploy/.env exists; ci.sh writes its own (use a clean checkout)'

backups=$(mktemp -d)
cleanup() {
  compose --profile drill down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
  rm -rf "$backups"
}
trap cleanup EXIT
# The backup service writes as uid 70; this throwaway directory lets it.
chmod 0777 "$backups"

overrides=compose.yaml
# Until Stage 340 is merged this revision has no AUTH_MODE=invitations (deploy/AGENTS.md).
[ -f "$DEPLOY_DIR/verify/pre-340.yaml" ] && overrides=compose.yaml:verify/pre-340.yaml
cat >"$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=ltw-ci-$$
COMPOSE_FILE=$overrides
PUBLIC_HOST=localhost
PUBLIC_ORIGIN=https://localhost
TLS_MODE=internal
PROXY_HTTP_PUBLISH=127.0.0.1:${LTW_CI_HTTP_PORT:-80}
PROXY_HTTPS_PUBLISH=127.0.0.1:${LTW_CI_HTTPS_PORT:-443}
POSTGRES_PASSWORD=$(openssl rand -hex 32)
BACKUP_DIR=$backups
EOF
chmod 600 "$ENV_FILE"

say 'images of HEAD'
tag=$("$DEPLOY_DIR/scripts/build.sh" HEAD)
"$DEPLOY_DIR/scripts/deploy.sh" "$tag"
say 'seeding Ravenford through the World Engine'
compose exec -T server node "$SERVER_DIST/world-engine/seed-ravenford-cli.js"
"$DEPLOY_DIR/verify/smoke.sh"
"$DEPLOY_DIR/scripts/backup-now.sh"
"$DEPLOY_DIR/scripts/restore-drill.sh"
"$DEPLOY_DIR/verify/retention-check.sh"
"$DEPLOY_DIR/verify/proxy-contract.sh" "$tag"

say 'live stream through the proxy (development personas, local only)'
set_env_value COMPOSE_FILE compose.yaml:verify/dev-personas.yaml
compose up --detach --wait --wait-timeout 300
"$DEPLOY_DIR/verify/live-stream.sh"
say "deployment check passed for $tag"

#!/usr/bin/env bash
# ci.sh: the deployment check of hosted CI (and of any clean checkout with Docker): builds the
# images of HEAD, writes a throwaway deploy/.env (random password, localhost, internal TLS,
# backups in a temporary directory), starts the stack as production runs it (invitation sign-in,
# compose.yaml alone), seeds the review campaign, and runs the smoke checks, a backup and the
# restore drill, the retention and proxy contract checks, the sign-in journeys, the live stream
# check and the trust boundary checks (last: they spend a minute of this host's redeem budget).
# Removes every container, volume, network and file it created, whatever happens.
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

https_port=${LTW_CI_HTTPS_PORT:-443}
# Private from the first byte (the password is in it).
mask=$(umask)
umask 077
cat >"$ENV_FILE" <<ENV
COMPOSE_PROJECT_NAME=ltw-ci-$$
PUBLIC_HOST=localhost
PUBLIC_ORIGIN=https://localhost$([ "$https_port" = 443 ] || printf ':%s' "$https_port")
TLS_MODE=internal
PROXY_HTTP_PUBLISH=127.0.0.1:${LTW_CI_HTTP_PORT:-80}
PROXY_HTTPS_PUBLISH=127.0.0.1:$https_port
POSTGRES_PASSWORD=$(openssl rand -hex 32)
BACKUP_DIR=$backups
ENV
umask "$mask"

say 'images of HEAD'
tag=$("$DEPLOY_DIR/scripts/build.sh" HEAD)
"$DEPLOY_DIR/scripts/deploy.sh" "$tag"
say 'seeding the review campaign through the World Engine (no DM link in this log)'
server_node "$SERVER_DIST/world-engine/seed-review-campaign-cli.js" | grep -v '^{'
"$DEPLOY_DIR/verify/smoke.sh"
"$DEPLOY_DIR/scripts/backup-now.sh"
"$DEPLOY_DIR/scripts/restore-drill.sh"
"$DEPLOY_DIR/verify/retention-check.sh"
"$DEPLOY_DIR/verify/proxy-contract.sh" "$tag"
"$DEPLOY_DIR/verify/sign-in-journey.sh"
"$DEPLOY_DIR/verify/live-stream.sh"
"$DEPLOY_DIR/verify/trust-boundary.sh"
say "deployment check passed for $tag"

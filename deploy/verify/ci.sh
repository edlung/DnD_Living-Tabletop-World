#!/usr/bin/env bash
# ci.sh: the deployment check of hosted CI (and of any clean checkout with Docker): builds the
# images of HEAD, writes a throwaway deploy/.env (random password, localhost, internal TLS,
# backups in a temporary directory), checks the preflight guards, starts the stack as production
# runs it (invitation sign-in, compose.yaml alone), seeds the review campaign, and runs the smoke
# checks, the restore drill on the first dump (taken before the seed: refused as empty unless the
# operator allows it), a second deploy (its protected pre-deploy dump), a backup and the restore
# drill, the retention, proxy contract and watch checks, the sign-in journeys, the live stream
# check and the trust boundary checks (last: they spend a minute of this host's redeem budget).
# Removes every container, volume, network and file it created, whatever happens.
# Refuses to run on Docker Engine before 28 (the isolated internal networks need it) and when
# deploy/.env exists. Ports: LTW_CI_HTTP_PORT and LTW_CI_HTTPS_PORT (default 80 and 443, bound to
# 127.0.0.1).
source "$(dirname "$0")/../scripts/lib.sh"
require_docker_engine
[ ! -e "$ENV_FILE" ] || die 'deploy/.env exists; ci.sh writes its own (use a clean checkout)'

backups=$(mktemp -d)
drill_log_existed=false
[ ! -e "$DRILL_LOG" ] || drill_log_existed=true
cleanup() {
  compose --profile drill down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
  rm -rf "$backups"
  [ "$drill_log_existed" = true ] || rm -f "$DRILL_LOG"
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

"$DEPLOY_DIR/verify/preflight-check.sh"
say 'images of HEAD'
tag=$("$DEPLOY_DIR/scripts/build.sh" HEAD)
"$DEPLOY_DIR/scripts/deploy.sh" "$tag"
# The backup service's first dump precedes the seed: no campaign is in it.
first=$(compose exec -T backup sh -c 'ls -1 /backups | grep -E "^ltw-[0-9]{8}T[0-9]{6}Z\.dump$" | sort | head -n 1')
say 'seeding the review campaign through the World Engine (no DM link in this log)'
server_node "$SERVER_DIST/world-engine/seed-review-campaign-cli.js" | grep -v '^{'
"$DEPLOY_DIR/verify/smoke.sh"
say "restore drill on the first dump ($first, empty): must fail"
if "$DEPLOY_DIR/scripts/restore-drill.sh" "$first"; then
  die 'the restore drill passed an empty dump'
fi
say 'the same with --allow-empty: passes, since the campaign came after the dump'
"$DEPLOY_DIR/scripts/restore-drill.sh" --allow-empty "$first"
say 'a second deploy of the same images: a protected pre-deploy dump first'
"$DEPLOY_DIR/scripts/deploy.sh" "$tag"
compose exec -T backup /bin/sh /opt/ltw/backup.sh verify "$(env_value LTW_PREDEPLOY_DUMP)"
"$DEPLOY_DIR/scripts/backup-now.sh"
"$DEPLOY_DIR/scripts/restore-drill.sh"
"$DEPLOY_DIR/verify/retention-check.sh"
"$DEPLOY_DIR/verify/watch-check.sh"
"$DEPLOY_DIR/verify/proxy-contract.sh" "$tag"
"$DEPLOY_DIR/verify/sign-in-journey.sh"
"$DEPLOY_DIR/verify/live-stream.sh"
"$DEPLOY_DIR/verify/trust-boundary.sh"
say "deployment check passed for $tag"

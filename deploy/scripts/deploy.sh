#!/usr/bin/env bash
# deploy.sh [--rollback] <tag>: runs the images of <tag> (built by build.sh) on this host.
# Takes a backup first when the stack is running, records the current tag as the previous one in
# deploy/.env, starts every service and waits until all are healthy. --rollback is for returning
# to an earlier tag: it lets that image start on a database a newer image migrated (additive
# migrations only; deploy/RUNBOOK.md, "Roll back"). Without it such a database is refused.
# When the networks of compose.yaml differ from the last deploy's (LTW_NETWORKS_DIGEST), the
# containers are removed first (`down`, volumes kept) and everything is created again: Compose
# alone either restarts an unchanged container on a recreated network without its service name
# (nothing finds `postgres`) or fails to remove a network a running container still uses.
source "$(dirname "$0")/lib.sh"

rollback=false
if [ "${1:-}" = --rollback ]; then
  rollback=true
  shift
fi
[ $# -eq 1 ] || die 'usage: deploy.sh [--rollback] <tag>'
tag=$1
require_env_file
for image in "ltw-server:$tag" "ltw-proxy:$tag"; do
  docker image inspect "$image" >/dev/null 2>&1 ||
    die "no image $image: run deploy/scripts/build.sh <revision> first"
done

current=$(env_value LTW_IMAGE_TAG)
if compose ps --status running --services 2>/dev/null | grep -qx backup; then
  say 'backup before the change'
  "$DEPLOY_DIR/scripts/backup-now.sh"
fi
if [ -n "$current" ] && [ "$current" != "$tag" ]; then
  set_env_value LTW_PREVIOUS_IMAGE_TAG "$current"
fi
set_env_value LTW_IMAGE_TAG "$tag"
set_env_value LTW_ALLOW_NEWER_SCHEMA "$rollback"

# The resolved networks block of compose.yaml (no secret is in it), hashed.
networks=$(compose config | awk '/^[^ ]/ { keep = ($0 == "networks:") } keep' |
  openssl dgst -sha256 -r | cut -d' ' -f1)
if [ -n "$(compose ps --all --quiet 2>/dev/null)" ] &&
  [ "$networks" != "$(env_value LTW_NETWORKS_DIGEST)" ]; then
  say 'the networks changed since the last deploy: containers and networks are created anew (volumes kept)'
  compose down --remove-orphans
fi

say "starting ltw-server:$tag and ltw-proxy:$tag (previous: ${current:-none})"
compose up --detach --wait --wait-timeout 300 --remove-orphans
set_env_value LTW_NETWORKS_DIGEST "$networks"
compose ps
say "deployed $tag"

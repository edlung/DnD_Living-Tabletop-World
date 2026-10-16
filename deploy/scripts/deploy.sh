#!/usr/bin/env bash
# deploy.sh [--rollback] <tag>: runs the images of <tag> (built by build.sh) on this host
# (deploy/RUNBOOK.md, sections 2 and 3).
#  1. Before anything changes: Docker Engine 28 or later, both images present, and a tag that
#     does not contain the running revision only with --rollback.
#  2. When the networks of compose.yaml differ from the last deploy's (LTW_NETWORKS_DIGEST), the
#     containers are removed (`down`, volumes kept) and created again below: Compose alone either
#     restarts an unchanged container on a recreated network without its service name (nothing
#     finds `postgres`) or fails to remove a network a running container still uses.
#  3. When the database exists, its state is kept first as a protected dump (backup.sh
#     pre-deploy; the regular retention never removes it, the newest BACKUP_KEEP_PROTECTED are
#     kept). PostgreSQL and the backup service are started for it when they are not running, and
#     the backup service is recreated whenever deploy/backup/ changed (LTW_BACKUP_SCRIPT_DIGEST),
#     so its loop runs this checkout's script. The dump's name goes to deploy/.env:
#     LTW_PREDEPLOY_DUMP for a deploy (what the runbook's rollback restores if the earlier image
#     cannot read the history), LTW_ROLLBACK_DUMP for a rollback.
#  4. The current tag becomes LTW_PREVIOUS_IMAGE_TAG; the containers are created and the internal
#     networks checked for a host address before anything starts; every service starts and the
#     deploy waits until all are healthy.
# --rollback returns to an earlier tag: that image may start on a database a newer image migrated
# (additive migrations only), and its readiness parses every stored event before it reports
# ready, so it never serves history it cannot read (LTW_ALLOW_NEWER_SCHEMA).
source "$(dirname "$0")/lib.sh"

rollback=false
if [ "${1:-}" = --rollback ]; then
  rollback=true
  shift
fi
[ $# -eq 1 ] || die 'usage: deploy.sh [--rollback] <tag>'
tag=$1
require_docker_engine
require_env_file
for image in "ltw-server:$tag" "ltw-proxy:$tag"; do
  docker image inspect "$image" >/dev/null 2>&1 ||
    die "no image $image: run deploy/scripts/build.sh <revision> first"
done

current=$(env_value LTW_IMAGE_TAG)
# A tag without the running revision is a rollback: what the running image wrote may be beyond
# it, and only the rollback step lets it start and reads every stored event before it is ready.
if [ "$rollback" = false ] && [ -n "$current" ] && [ "$current" != "$tag" ]; then
  running_commit=$(commit_of "$current")
  next_commit=$(commit_of "$tag")
  if [ -z "$running_commit" ] || [ -z "$next_commit" ]; then
    say "cannot tell whether $tag contains the running $current (not in this checkout): if it does not, stop and use --rollback"
  elif ! git -C "$REPO_DIR" merge-base --is-ancestor "$running_commit" "$next_commit"; then
    die "$tag does not contain the running $current: that is a rollback (deploy.sh --rollback $tag; deploy/RUNBOOK.md section 3)"
  fi
fi

# The resolved networks block of compose.yaml (no secret is in it), hashed.
networks_digest() {
  compose config | awk '/^[^ ]/ { keep = ($0 == "networks:") } keep' |
    openssl dgst -sha256 -r | cut -d' ' -f1
}

set_env_value LTW_BACKUP_SCRIPT_DIGEST "$(backup_script_digest)"
if [ -n "$(compose ps --all --quiet 2>/dev/null)" ] &&
  [ "$(networks_digest)" != "$(env_value LTW_NETWORKS_DIGEST)" ]; then
  say 'the networks changed since the last deploy: containers and networks are created anew (volumes kept)'
  compose down --remove-orphans
fi

if database_exists; then
  say 'backup before the change (protected dump)'
  compose up --detach --wait --wait-timeout 180 postgres backup
  dump=$(compose exec -T backup /bin/sh /opt/ltw/backup.sh pre-deploy)
  [ -n "$dump" ] || die 'the pre-deploy dump reported no name'
  if [ "$rollback" = true ]; then
    set_env_value LTW_ROLLBACK_DUMP "$dump"
    say "the state before the rollback: $dump (LTW_ROLLBACK_DUMP)"
  else
    set_env_value LTW_PREDEPLOY_DUMP "$dump"
    say "the state before this deploy: $dump (LTW_PREDEPLOY_DUMP)"
  fi
else
  say 'no database yet: nothing to back up'
fi

if [ -n "$current" ] && [ "$current" != "$tag" ]; then
  set_env_value LTW_PREVIOUS_IMAGE_TAG "$current"
fi
set_env_value LTW_IMAGE_TAG "$tag"
set_env_value LTW_ALLOW_NEWER_SCHEMA "$rollback"

say "starting ltw-server:$tag and ltw-proxy:$tag (previous: ${current:-none})"
compose up --no-start --remove-orphans
require_isolated_networks "$(project_name)"
compose up --detach --wait --wait-timeout 300 --remove-orphans
set_env_value LTW_NETWORKS_DIGEST "$(networks_digest)"
compose ps
say "deployed $tag"

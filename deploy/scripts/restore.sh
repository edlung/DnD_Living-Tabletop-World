#!/usr/bin/env bash
# restore.sh [--allow-empty] <dump file name>: replaces the live database with a dump
# (deploy/RUNBOOK.md, section 5). Play after the dump is lost. In order:
#  1. the dump is checked against the manifest and its contents;
#  2. the current state is kept as a protected dump (backup.sh pre-restore; the regular retention
#     never removes it) and its name printed;
#  3. the backup service, the proxy and the server stop: no dump of an empty or half-restored
#     database is written (none becomes `latest`), and nobody plays meanwhile;
#  4. the database is dropped and created again, and the dump restored into it in one transaction
#     by a one-off container of the backup service;
#  5. every service starts (migrations bring an older dump forward; the backup loop's first dump
#     is of the restored database) and the restore drill proves the result (--allow-empty passes
#     on that the dump is of a legitimately empty database).
# If step 4 fails, the database may be empty and the backup service, proxy and server stay
# stopped: restore the protected dump of step 2 the same way. Without a running backup service
# (a new server), steps 1 and 2 run in one-off containers of it.
source "$(dirname "$0")/lib.sh"
require_env_file
require_docker_engine

allow_empty=()
if [ "${1:-}" = --allow-empty ]; then
  allow_empty=(--allow-empty)
  shift
fi
[ $# -eq 1 ] || die 'usage: restore.sh [--allow-empty] <dump file name>'
name=$1
case $name in
  ltw-*.dump) ;;
  *) die "not a dump file name: $name" ;;
esac

# A backup.sh action in the running backup service, or in a one-off container of it.
backup_sh() {
  if service_running backup; then
    compose exec -T backup /bin/sh /opt/ltw/backup.sh "$@"
  else
    compose run --rm --no-deps -T backup "$@"
  fi
}

compose up --detach --wait --wait-timeout 180 postgres
say "dump: $name"
backup_sh verify "$name"
say 'the current state, kept as a protected dump'
kept=$(backup_sh pre-restore)
[ -n "$kept" ] || die 'the pre-restore dump reported no name'
say "the state before the restore: $kept"

say 'stopping the backup service, the proxy and the server'
compose stop backup proxy server
restored=false
unfinished() {
  [ "$restored" = true ] ||
    printf '%s\n' "restore.sh: the restore did not complete: the database may be empty, and the backup service, proxy and server stay stopped. Back to the state before it: deploy/scripts/restore.sh $kept" >&2
}
trap unfinished EXIT

say 'the database, empty'
compose exec -T postgres psql --username ltw --dbname postgres --quiet --set ON_ERROR_STOP=1 \
  --command 'DROP DATABASE ltw WITH (FORCE)' --command 'CREATE DATABASE ltw OWNER ltw'
say "restoring $name (one transaction)"
compose run --rm --no-deps -T --entrypoint pg_restore backup --exit-on-error \
  --single-transaction --no-owner --no-privileges --dbname ltw "/backups/$name"
restored=true

say 'starting every service (migrations bring an older dump forward)'
compose up --no-start
require_isolated_networks "$(project_name)"
compose up --detach --wait --wait-timeout 300
"$DEPLOY_DIR/scripts/restore-drill.sh" ${allow_empty[@]+"${allow_empty[@]}"} "$name"
say "restored $name; the state before it: $kept"

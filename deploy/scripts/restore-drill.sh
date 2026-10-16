#!/usr/bin/env bash
# restore-drill.sh [--allow-empty] [<dump file name>]: proves a backup restores to the same world
# (docs/adr/0037-deployment.md §4). The newest regular dump (or the one named) is checked against
# the manifest, restored into a throwaway PostgreSQL (`drill-db`: tmpfs, internal network),
# migrated by this image, and every campaign stream in it is replayed through the World Engine;
# the live database is replayed at the same stream versions and the state digests compared. Exits
# 0 only when every restored stream matches, the restore holds a stream at all (a dump of an empty
# or half-restored database fails, unless --allow-empty says the database legitimately is empty),
# and every live stream created before the dump was taken (the time in its name) is in it. Each
# run appends its verdict to deploy/restore-drill.log (`<epoch> <UTC time> passed|failed <dump>`),
# on which watch.sh alarms when the last drill failed or is older than 8 days. The throwaway
# database is removed whatever happens. The password stays inside the containers.
source "$(dirname "$0")/lib.sh"

allow_empty=()
if [ "${1:-}" = --allow-empty ]; then
  allow_empty=(--allow-empty)
  shift
fi
[ $# -le 1 ] || die 'usage: restore-drill.sh [--allow-empty] [<dump file name>]'

work=$(mktemp -d)
name=''
finish() {
  local status=$? verdict=failed
  if [ "$status" -eq 0 ]; then
    verdict=passed
  fi
  compose --profile drill rm --stop --force --volumes drill-db >/dev/null 2>&1 || true
  rm -rf "$work"
  printf '%s %s %s %s\n' "$(date -u +%s)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$verdict" \
    "${name:--}" >>"$DRILL_LOG" || printf 'restore-drill.sh: cannot record the verdict\n' >&2
  exit "$status"
}
trap finish EXIT

# Runs a command in the server container against the throwaway database: the server's own
# connection URL (the server holds no other database setting) with the drill database's host and
# name, so the password stays inside the container; refused unless it names the drill database,
# so nothing runs against the live one.
in_drill() {
  # shellcheck disable=SC2016 # expanded inside the container
  compose exec -T server sh -c '
    url=$(printf "%s" "$DATABASE_URL" | sed "s|@postgres:5432/ltw\$|@drill-db:5432/ltw_restore_drill|")
    case $url in
      *@drill-db:5432/ltw_restore_drill) ;;
      *)
        echo "restore-drill.sh: unexpected form of the server connection URL" >&2
        exit 97
        ;;
    esac
    DATABASE_URL=$url exec "$@"' drill "$@"
}

name=${1:-$(compose exec -T backup /bin/sh /opt/ltw/backup.sh latest)}
# The dump's time from its name (UTC, whole seconds; pg_dump's snapshot comes after it).
dumped_at=$(printf '%s\n' "$name" | sed -nE \
  's/^ltw-([a-z]+-)?([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.dump$/\2-\3-\4T\5:\6:\7Z/p')
[ -n "$dumped_at" ] || die "not a dump file name: $name"
say "dump: $name (taken $dumped_at)"
compose exec -T backup /bin/sh /opt/ltw/backup.sh verify "$name"

say 'throwaway database'
compose --profile drill up --detach --wait drill-db
compose exec -T drill-db pg_restore --exit-on-error --single-transaction --no-owner \
  --no-privileges --username ltw --dbname ltw_restore_drill "/backups/$name"

say 'migrations of this image on the restored database'
in_drill node "$SERVER_DIST/platform/db/migrate-cli.js"

say 'restored tables (exact row counts)'
printf '%s\n' "SELECT format('SELECT %L, count(*) FROM %I', tablename, tablename)
  FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \\gexec" |
  compose exec -T drill-db psql --username ltw --dbname ltw_restore_drill --no-align \
    --tuples-only --field-separator ' ' --quiet

say 'replay of every restored campaign stream'
in_drill node "$SERVER_DIST/world-engine/replay-digest-cli.js" digest >"$work/restored.json"
cat "$work/restored.json"

say 'live database replayed at the same versions'
if server_node "$SERVER_DIST/world-engine/replay-digest-cli.js" compare --expected - \
  --dumped-at "$dumped_at" ${allow_empty[@]+"${allow_empty[@]}"} \
  <"$work/restored.json" >"$work/compared.json"; then
  cat "$work/compared.json"
  say 'restore drill passed'
else
  cat "$work/compared.json"
  die 'restore drill FAILED: a restored campaign differs from the live one, the restore is empty, or it lacks a live campaign (see failures)'
fi

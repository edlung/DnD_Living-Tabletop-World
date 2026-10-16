#!/usr/bin/env bash
# restore-drill.sh [<dump file name>]: proves a backup restores to the same world
# (docs/adr/0037-deployment.md §4). The newest dump (or the one named) is checked against the
# manifest, restored into a throwaway PostgreSQL (`drill-db`: tmpfs, internal network), migrated
# by this image, and every campaign stream in it is replayed through the World Engine; the live
# database is replayed at the same stream versions and the state digests compared. Exits 0 only
# when every stream matches; the throwaway database is removed whatever happens. The password
# stays inside the containers.
source "$(dirname "$0")/lib.sh"

DRILL_URL='postgres://ltw:${POSTGRES_PASSWORD}@drill-db:5432/ltw_restore_drill'
work=$(mktemp -d)
cleanup() {
  compose --profile drill rm --stop --force --volumes drill-db >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# Runs a command in the server container against the throwaway database.
in_drill() {
  compose exec -T server sh -c "DATABASE_URL=\"$DRILL_URL\" exec \"\$@\"" drill "$@"
}

name=${1:-$(compose exec -T backup /bin/sh /opt/ltw/backup.sh latest)}
say "dump: $name"
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
  <"$work/restored.json" >"$work/compared.json"; then
  cat "$work/compared.json"
  say 'restore drill passed'
else
  cat "$work/compared.json"
  die 'restore drill FAILED: the restored world differs from the live one'
fi

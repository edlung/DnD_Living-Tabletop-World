#!/bin/sh
# Database backups of the deployment (docs/adr/0037-deployment.md; deploy/RUNBOOK.md). Runs in the
# `backup` service, the same PostgreSQL image as the database, as its `postgres` user. Connection
# settings come from PG* variables, never arguments; the password never reaches a log.
#
#   backup.sh loop            the service: a dump now, then one every BACKUP_INTERVAL_SECONDS
#   backup.sh once            a dump now (deploy/scripts/backup-now.sh)
#   backup.sh pre-deploy      a protected dump before a deploy or rollback (deploy/scripts/deploy.sh);
#                             prints its file name
#   backup.sh pre-restore     a protected dump of the state a restore replaces
#                             (deploy/scripts/restore.sh); prints its file name
#   backup.sh latest          the newest regular dump's file name
#   backup.sh verify [<name>] a dump (default: the newest regular one) against the manifest, and
#                             its contents
#   backup.sh health          the service's health check: the newest regular dump is recent enough
#   backup.sh prune           apply the retention and rewrite the manifest (also after every dump)
#
# Dumps are `pg_dump --format=custom` files named ltw-YYYYMMDDTHHMMSSZ.dump (UTC). Retention keeps
# every dump younger than a day, the newest dump of each of the BACKUP_KEEP_DAILY most recent days
# and of each of the BACKUP_KEEP_WEEKLY most recent ISO weeks. Protected dumps,
# ltw-predeploy-YYYYMMDDTHHMMSSZ.dump and ltw-prerestore-YYYYMMDDTHHMMSSZ.dump, are never part of
# that retention: the newest BACKUP_KEEP_PROTECTED (default 5) of each kind are kept. SHA256SUMS
# lists every dump kept.
set -eu
umask 077

DIR=${BACKUP_TARGET:-/backups}
INTERVAL=${BACKUP_INTERVAL_SECONDS:-21600}
KEEP_DAILY=${BACKUP_KEEP_DAILY:-14}
KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-8}
KEEP_PROTECTED=${BACKUP_KEEP_PROTECTED:-5}
MANIFEST="$DIR/SHA256SUMS"
STAMP='[0-9]{8}T[0-9]{6}Z'
# Regular dumps (the retention above) and every dump (regular or protected).
PATTERN="^ltw-${STAMP}\\.dump\$"
ANY_DUMP="^ltw-((predeploy|prerestore)-)?${STAMP}\\.dump\$"

# JSON log lines on stderr (stdout carries only answers such as `latest`).
log() {
  printf '{"time":"%s","service":"ltw-backup","level":"%s","msg":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >&2
}

# Regular dumps, or those matching the pattern given, newest first (the names sort by time).
dumps_newest_first() {
  ls -1 "$DIR" | grep -E "${1:-$PATTERN}" | sort -r || true
}

# Epoch seconds of a dump's name: ltw-20261016T120000Z.dump -> 1792152000 (busybox date).
epoch_of() {
  date -u -d "$(echo "$1" | sed -E \
    's/^ltw-([a-z]+-)?([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.dump$/\2-\3-\4 \5:\6:\7/')" +%s
}

# One backup action at a time across the loop and on-demand runs (busybox flock has no timeout).
lock() {
  exec 9>"$DIR/.lock"
  tries=0
  until flock -n 9; do
    tries=$((tries + 1))
    if [ "$tries" -ge 300 ]; then
      log error 'another backup action is still running'
      return 1
    fi
    sleep 2
  done
}

prune() {
  now=${BACKUP_NOW_EPOCH:-$(date -u +%s)}
  days_seen=' '
  weeks_seen=' '
  days=0
  weeks=0
  kept=0
  removed=0
  for name in $(dumps_newest_first); do
    epoch=$(epoch_of "$name")
    day=$(date -u -d "@$epoch" +%Y%m%d)
    week=$(date -u -d "@$epoch" +%G-W%V)
    keep=no
    [ $((now - epoch)) -lt 86400 ] && keep=yes
    case "$days_seen" in
      *" $day "*) ;;
      *) if [ "$days" -lt "$KEEP_DAILY" ]; then
        days_seen="$days_seen$day "
        days=$((days + 1))
        keep=yes
      fi ;;
    esac
    case "$weeks_seen" in
      *" $week "*) ;;
      *) if [ "$weeks" -lt "$KEEP_WEEKLY" ]; then
        weeks_seen="$weeks_seen$week "
        weeks=$((weeks + 1))
        keep=yes
      fi ;;
    esac
    if [ "$keep" = yes ]; then
      kept=$((kept + 1))
    else
      rm -f "$DIR/$name"
      removed=$((removed + 1))
    fi
  done
  for protected in predeploy prerestore; do
    count=0
    for name in $(dumps_newest_first "^ltw-$protected-${STAMP}\\.dump\$"); do
      count=$((count + 1))
      if [ "$count" -le "$KEEP_PROTECTED" ]; then
        kept=$((kept + 1))
      else
        rm -f "$DIR/$name"
        removed=$((removed + 1))
      fi
    done
  done
  write_manifest
  log info "retention: kept $kept, removed $removed"
}

# Rewrites the manifest for the dumps that exist, hashing only those it does not list yet.
write_manifest() {
  next="$DIR/.SHA256SUMS.next"
  : >"$next"
  for name in $(dumps_newest_first "$ANY_DUMP" | sort); do
    line=$(grep -E "^[0-9a-f]{64}  $name\$" "$MANIFEST" 2>/dev/null || true)
    if [ -n "$line" ]; then
      echo "$line" >>"$next"
    else
      (cd "$DIR" && sha256sum "$name") >>"$next"
    fi
  done
  mv "$next" "$MANIFEST"
}

# A dump now: regular, or protected when a kind (predeploy, prerestore) is given, whose name it
# then prints on stdout. (POSIX sh has no local variables: `prune` reuses `name`.)
dump_once() {
  kind=${1:-}
  lock
  name="ltw-${kind:+$kind-}$(date -u +%Y%m%dT%H%M%SZ).dump"
  while [ -e "$DIR/$name" ]; do
    sleep 1
    name="ltw-${kind:+$kind-}$(date -u +%Y%m%dT%H%M%SZ).dump"
  done
  partial="$DIR/.partial-$name"
  rm -f "$DIR"/.partial-*
  if ! pg_dump --format=custom --no-password --file="$partial"; then
    rm -f "$partial"
    log error 'pg_dump failed'
    return 1
  fi
  # The archive's table of contents must be readable before it counts as a backup.
  pg_restore --list "$partial" >/dev/null
  mv "$partial" "$DIR/$name"
  written=$name
  log info "backup written: $written ($(wc -c <"$DIR/$written" | tr -d ' ') bytes)"
  prune
  if [ -n "$kind" ]; then
    echo "$written"
  fi
}

latest() {
  name=$(dumps_newest_first | head -n 1)
  [ -n "$name" ] || {
    log error 'no backup yet'
    return 1
  }
  echo "$name"
}

verify() {
  name=${1:-$(latest)}
  echo "$name" | grep -Eq "$ANY_DUMP" || {
    log error 'not a backup file name'
    return 1
  }
  line=$(grep -E "^[0-9a-f]{64}  $name\$" "$MANIFEST" 2>/dev/null || true)
  [ -n "$line" ] || {
    log error "not in the manifest: $name"
    return 1
  }
  echo "$line" | (cd "$DIR" && sha256sum -c -s -) || {
    log error "checksum mismatch: $name"
    return 1
  }
  pg_restore --list "$DIR/$name" >/dev/null
  log info "verified: $name"
}

health() {
  name=$(latest) || return 1
  age=$(($(date -u +%s) - $(epoch_of "$name")))
  [ "$age" -lt $((INTERVAL + 3600)) ] || {
    log error "newest backup is $age s old"
    return 1
  }
}

loop() {
  trap 'log info "stopping"; exit 0' TERM INT
  log info "backups every $INTERVAL s; keeping $KEEP_DAILY daily and $KEEP_WEEKLY weekly"
  while :; do
    # A subshell: its lock is released when it ends, whatever happened inside.
    (dump_once) || log error 'backup failed; next attempt after the interval'
    sleep "$INTERVAL" &
    wait $!
  done
}

case "${1:-}" in
  loop) loop ;;
  once) dump_once ;;
  pre-deploy) dump_once predeploy ;;
  pre-restore) dump_once prerestore ;;
  latest) latest ;;
  verify) verify "${2:-}" ;;
  health) health ;;
  prune) lock && prune ;;
  *)
    echo 'usage: backup.sh loop|once|pre-deploy|pre-restore|latest|verify [<name>]|health|prune' >&2
    exit 2
    ;;
esac

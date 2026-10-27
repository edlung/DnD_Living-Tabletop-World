#!/usr/bin/env bash
# retention-check.sh: checks deploy/backup/backup.sh's retention and manifest in the backup image,
# without a database: 480 empty dumps, one every 6 h for 120 days before a fixed "now"
# (2026-10-16T12:00:00Z), 8 protected pre-deploy dumps (one every 15 days) and 3 protected
# pre-restore dumps (100 to 119 days old), then `prune`. Expected: of the regular dumps the 4
# younger than a day, the newest of each of the 14 most recent days and of each of the 8 most
# recent ISO weeks (21 files); of the protected ones the 5 newest of each kind, however old (5
# pre-deploy, 3 pre-restore); all 29 listed in SHA256SUMS, which verifies. Exit status 0 when all
# of that holds; names with an impossible or future time are ignored, and a dump backup.sh did
# not write is never listed (not even after another prune), so it is never `latest`. The script directory is mounted as the backup service mounts it.
set -euo pipefail
DEPLOY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=$(sed -n 's/^x-postgres-image: &postgres-image //p' "$DEPLOY_DIR/compose.yaml")

docker run --rm --network none --user 70:70 --read-only --tmpfs /backups:uid=70,gid=70 \
  --volume "$DEPLOY_DIR/backup:/opt/ltw:ro" \
  --env BACKUP_NOW_EPOCH=1792152000 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
now=1792152000
for k in $(seq 0 479); do
  touch "/backups/ltw-$(date -u -d "@$((now - k * 21600))" +%Y%m%dT%H%M%SZ).dump"
done
for k in $(seq 0 7); do
  touch "/backups/ltw-predeploy-$(date -u -d "@$((now - k * 15 * 86400 - 3600))" +%Y%m%dT%H%M%SZ).dump"
done
for days in 100 110 119; do
  touch "/backups/ltw-prerestore-$(date -u -d "@$((now - days * 86400))" +%Y%m%dT%H%M%SZ).dump"
done
# The dumps above stand for ones backup.sh wrote: the manifest lists them.
(cd /backups && sha256sum ltw-*.dump) >/backups/SHA256SUMS
# Never listed, never latest: a name whose time is not a real time or lies ahead of the clock,
# and a valid name only dropped into the directory (kept, never removed by retention either).
touch /backups/ltw-20261016T999999Z.dump /backups/ltw-20991231T235959Z.dump
touch /backups/ltw-20261016T130000Z.dump
/bin/sh /opt/ltw/backup.sh prune
expect_impossible_kept=/backups/ltw-20261016T999999Z.dump
kept=$(ls /backups | grep -vE "T999999Z|20991231|T130000Z" | grep -c "^ltw-[0-9].*\.dump$")
predeploy=$(ls /backups | grep -c "^ltw-predeploy-.*\.dump$")
prerestore=$(ls /backups | grep -c "^ltw-prerestore-.*\.dump$")
echo "kept $kept of 480 regular, $predeploy of 8 pre-deploy, $prerestore of 3 pre-restore"
expect() { [ -e "/backups/$1" ] || { echo "missing $1"; exit 1; }; }
gone() { [ ! -e "/backups/$1" ] || { echo "should be gone: $1"; exit 1; }; }
expect ltw-20261016T120000Z.dump   # now
expect ltw-20261016T000000Z.dump   # younger than a day
expect ltw-20261015T180000Z.dump   # younger than a day, newest of its day
gone ltw-20261015T120000Z.dump     # older than a day, not the newest of its day
expect ltw-20261003T180000Z.dump   # newest of the 14th day
gone ltw-20261002T180000Z.dump     # a 15th day, same ISO week as a kept dump
expect ltw-20260927T180000Z.dump   # newest of ISO week 39
expect ltw-20260830T180000Z.dump   # newest of the 8th ISO week (35)
gone ltw-20260829T180000Z.dump     # week 35 already kept
gone ltw-20260823T180000Z.dump     # a 9th week
expect ltw-predeploy-20261016T110000Z.dump   # the newest pre-deploy dump
expect ltw-predeploy-20260817T110000Z.dump   # the 5th newest: 60 days old, beyond the weeks kept
gone ltw-predeploy-20260802T110000Z.dump     # the 6th newest
expect ltw-prerestore-20260619T120000Z.dump  # 119 days old, one of 3
[ "$kept" -eq 21 ] || { echo "expected 21 regular dumps kept"; exit 1; }
[ "$predeploy" -eq 5 ] || { echo "expected the 5 newest pre-deploy dumps kept"; exit 1; }
[ "$prerestore" -eq 3 ] || { echo "expected all 3 pre-restore dumps kept"; exit 1; }
[ "$(wc -l < /backups/SHA256SUMS)" -eq 29 ] || { echo "manifest does not list 29"; exit 1; }
(cd /backups && sha256sum -c -s SHA256SUMS) || { echo "manifest does not verify"; exit 1; }
# A protected dump is a dump to `verify`: named and listed (the empty file then fails its contents).
refusal=$(/bin/sh /opt/ltw/backup.sh verify ltw-predeploy-20261016T110000Z.dump 2>&1) &&
  { echo "an empty file must not verify as a dump"; exit 1; }
case $refusal in
  *"not a backup file name"* | *"not in the manifest"*) echo "verify refuses a protected dump: $refusal"; exit 1 ;;
esac
[ -e "$expect_impossible_kept" ] || { echo "the impossible name was removed"; exit 1; }
if grep -qE "T999999Z|20991231|T130000Z" /backups/SHA256SUMS; then
  echo "a dump backup.sh did not write is listed"; exit 1
fi
/bin/sh /opt/ltw/backup.sh prune 2>/dev/null
if grep -q T130000Z /backups/SHA256SUMS; then echo "a second prune listed a dropped file"; exit 1; fi
[ "$(/bin/sh /opt/ltw/backup.sh latest 2>/dev/null)" = ltw-20261016T120000Z.dump ] ||
  { echo "latest is not the newest dump backup.sh wrote"; exit 1; }
echo "retention check passed"
'

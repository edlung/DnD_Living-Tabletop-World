#!/usr/bin/env bash
# retention-check.sh: checks deploy/backup/backup.sh's retention and manifest in the backup image,
# without a database: 480 empty dumps, one every 6 h for 120 days before a fixed "now"
# (2026-10-16T12:00:00Z), then `prune`. Expected: the 4 dumps younger than a day, the newest of
# each of the 14 most recent days and of each of the 8 most recent ISO weeks: 21 files, listed in
# SHA256SUMS, which verifies. Exit status 0 when all of that holds.
set -euo pipefail
DEPLOY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=$(sed -n 's/^x-postgres-image: &postgres-image //p' "$DEPLOY_DIR/compose.yaml")

docker run --rm --network none --user 70:70 --read-only --tmpfs /backups:uid=70,gid=70 \
  --volume "$DEPLOY_DIR/backup/backup.sh:/opt/ltw/backup.sh:ro" \
  --env BACKUP_NOW_EPOCH=1792152000 --entrypoint /bin/sh "$IMAGE" -c '
set -eu
now=1792152000
for k in $(seq 0 479); do
  touch "/backups/ltw-$(date -u -d "@$((now - k * 21600))" +%Y%m%dT%H%M%SZ).dump"
done
/bin/sh /opt/ltw/backup.sh prune
kept=$(ls /backups | grep -c "\.dump$")
echo "kept $kept of 480"
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
[ "$kept" -eq 21 ] || { echo "expected 21 kept"; exit 1; }
[ "$(wc -l < /backups/SHA256SUMS)" -eq 21 ] || { echo "manifest does not list 21"; exit 1; }
(cd /backups && sha256sum -c -s SHA256SUMS) || { echo "manifest does not verify"; exit 1; }
echo "retention check passed"
'

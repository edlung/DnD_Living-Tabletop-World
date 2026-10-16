#!/usr/bin/env bash
# backup-now.sh: one database dump now, in the running backup service (it waits for a dump
# already in progress), then the retention and the manifest; prints the new dump's file name.
source "$(dirname "$0")/lib.sh"

compose exec -T backup /bin/sh /opt/ltw/backup.sh once
name=$(compose exec -T backup /bin/sh /opt/ltw/backup.sh latest)
compose exec -T backup /bin/sh /opt/ltw/backup.sh verify "$name"
echo "$name"

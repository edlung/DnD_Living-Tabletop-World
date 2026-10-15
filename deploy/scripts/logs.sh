#!/usr/bin/env bash
# logs.sh [--since <duration>] [--errors] [<service>...]: the deployment's logs, oldest first.
# Defaults: the last hour of every service. --errors keeps error lines only (JSON `level` error or
# fatal from the server, proxy and backups; ERROR/FATAL/PANIC from PostgreSQL). Docker keeps
# 5 x 100 MB per service (`local` driver). Logs never carry credentials (ADR 0036, Stage 340 tests).
source "$(dirname "$0")/lib.sh"

ERROR_LINES='"level":"(error|fatal)"|(ERROR|FATAL|PANIC):'
since=1h
errors=false
services=()
while [ $# -gt 0 ]; do
  case $1 in
    --since)
      [ $# -ge 2 ] || die 'usage: logs.sh [--since <duration>] [--errors] [<service>...]'
      since=$2
      shift 2
      ;;
    --errors)
      errors=true
      shift
      ;;
    -*) die 'usage: logs.sh [--since <duration>] [--errors] [<service>...]' ;;
    *)
      services+=("$1")
      shift
      ;;
  esac
done

if [ "$errors" = true ]; then
  compose logs --no-color --since "$since" ${services[@]+"${services[@]}"} |
    grep -E "$ERROR_LINES" || true
else
  compose logs --no-color --since "$since" ${services[@]+"${services[@]}"}
fi

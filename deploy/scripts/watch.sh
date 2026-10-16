#!/usr/bin/env bash
# watch.sh: the host's alarms (docs/adr/0037-deployment.md, operations). Run it every 5 minutes
# from cron or a systemd timer (deploy/RUNBOOK.md). Raises an alarm for: disk use above 80 % (the
# root filesystem, Docker's data directory, the backup directory), memory use above 85 %, a
# service that is not running and healthy (the backup service turns unhealthy when its newest dump
# is older than the interval plus an hour), more than 20 error lines or 5xx answers in the last
# 15 minutes of the logs, readiness through the proxy failing, and a certificate expiring within
# 14 days. Each alarm is one line appended to the alarm log (default deploy/alarms.log) and, when
# ALARM_WEBHOOK_URL is set in deploy/.env, posted there as JSON `{"text": …}`. Exit status 1 when
# any alarm was raised. Limits: WATCH_DISK_PERCENT, WATCH_MEMORY_PERCENT, WATCH_ERROR_LINES,
# WATCH_WINDOW, WATCH_ALARM_LOG.
source "$(dirname "$0")/lib.sh"
require_env_file

DISK_LIMIT=${WATCH_DISK_PERCENT:-80}
MEMORY_LIMIT=${WATCH_MEMORY_PERCENT:-85}
ERROR_LIMIT=${WATCH_ERROR_LINES:-20}
WINDOW=${WATCH_WINDOW:-15m}
ALARM_LOG=${WATCH_ALARM_LOG:-$DEPLOY_DIR/alarms.log}
SERVICES='proxy server postgres backup'
PROBLEMS='"level":"(error|fatal)"|"statusCode":5[0-9]{2}|(ERROR|FATAL|PANIC):'
alarms=0

alarm() {
  local line url text
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) ltw-watch ALARM $*"
  printf '%s\n' "$line" >>"$ALARM_LOG"
  printf '%s\n' "$line" >&2
  alarms=$((alarms + 1))
  url=$(env_value ALARM_WEBHOOK_URL)
  if [ -n "$url" ]; then
    text=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
    curl --silent --show-error --fail --max-time 10 --header 'Content-Type: application/json' \
      --data "{\"text\":\"$text\"}" "$url" >/dev/null || printf 'ltw-watch: webhook failed\n' >&2
  fi
}

check_disk() {
  local path used
  for path in / "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)" \
    "$(env_value BACKUP_DIR)"; do
    [ -n "$path" ] && [ -d "$path" ] || continue
    used=$(df -P "$path" | awk 'NR == 2 { sub(/%/, "", $5); print $5 }')
    [ "$used" -le "$DISK_LIMIT" ] || alarm "disk $path at ${used}% (limit ${DISK_LIMIT}%)"
  done
}

check_memory() {
  local used free
  if [ -r /proc/meminfo ]; then
    used=$(awk '/^MemTotal:/ { t = $2 } /^MemAvailable:/ { a = $2 }
      END { printf "%d", (t - a) * 100 / t }' /proc/meminfo)
  elif command -v memory_pressure >/dev/null; then
    free=$(memory_pressure | sed -n 's/.*free percentage: \([0-9]*\)%.*/\1/p')
    used=$((100 - ${free:-100}))
  else
    return 0
  fi
  [ "$used" -le "$MEMORY_LIMIT" ] || alarm "memory at ${used}% (limit ${MEMORY_LIMIT}%)"
}

check_services() {
  local service state
  for service in $SERVICES; do
    state=$(compose ps --all --format '{{.State}} {{.Health}}' "$service" 2>/dev/null | head -n 1 |
      sed 's/ *$//')
    [ "$state" = 'running healthy' ] || alarm "service $service is '${state:-missing}'"
  done
}

check_errors() {
  local count
  # shellcheck disable=SC2086 # the service list splits on purpose
  count=$(compose logs --no-color --since "$WINDOW" $SERVICES 2>/dev/null |
    grep -cE "$PROBLEMS" || true)
  [ "$count" -le "$ERROR_LIMIT" ] ||
    alarm "$count error lines or 5xx answers in the last $WINDOW (limit $ERROR_LIMIT)"
}

check_edge() {
  local host port mode insecure=() end days
  host=$(env_value PUBLIC_HOST)
  [ -n "$host" ] || return 0
  port=$(published_port PROXY_HTTPS_PUBLISH 443)
  mode=$(env_value TLS_MODE)
  [ "$mode" = internal ] && insecure=(--insecure)
  curl --silent --fail --max-time 10 ${insecure[@]+"${insecure[@]}"} \
    --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/readyz" >/dev/null ||
    alarm "https://$host:$port/api/readyz is not ready"
  [ "$mode" = acme ] && command -v openssl >/dev/null || return 0
  end=$(printf '' | openssl s_client -connect "127.0.0.1:$port" -servername "$host" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')
  [ -n "$end" ] || {
    alarm "no certificate served for $host"
    return 0
  }
  days=$((($(date -u -d "$end" +%s 2>/dev/null || date -u -j -f '%b %e %T %Y %Z' "$end" +%s) -
    $(date -u +%s)) / 86400))
  [ "$days" -ge 14 ] || alarm "certificate for $host expires in $days days"
}

check_disk
check_memory
check_services
check_errors
check_edge
if [ "$alarms" -gt 0 ]; then
  exit 1
fi
printf '%s ltw-watch ok\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

#!/usr/bin/env bash
# Temporary (WebKit lab): every two seconds, the memory left, the largest processes and the
# browsers' network processes (pid, open files, memory) — a pid that goes while its browser lives
# is a crash.
while :; do
  printf '%s avail=%sMB net=%s web=%s top=' \
    "$(date -u +%T)" \
    "$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" \
    "$(for pid in $(pgrep -f NetworkProcess); do printf '%s:%sfd:%sMB,' "$pid" "$(sudo ls "/proc/$pid/fd" 2>/dev/null | wc -l)" "$(awk '/VmRSS/{print int($2/1024)}' "/proc/$pid/status" 2>/dev/null)"; done)" \
    "$(pgrep -fc WebProcess)"
  ps -eo rss=,comm= --sort=-rss | head -5 | awk '{printf "%s:%dMB ", $2, $1/1024}'
  echo
  sleep 2
done

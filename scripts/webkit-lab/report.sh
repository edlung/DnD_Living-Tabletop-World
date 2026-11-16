#!/usr/bin/env bash
# Temporary (WebKit lab): what the runner knows of a run, printed to the job's log.
set -u
lab=/tmp/lab
crashes=$(grep -cE 'malloc|corrupted|free\(\)|realloc\(\)|munmap_chunk' "$lab/stderr.log")
lost=$(grep -c 'internal error. This is a WebKit bug' "$lab/stderr.log")
cores=$(ls /tmp/cores/*.core 2>/dev/null | wc -l)
echo "[lab] heap corruption messages: $crashes; requests lost to a dead network process: $lost; core dumps: $cores"
pnpm exec playwright --version
echo "::group::[lab] machine"
nproc
free -m
echo "::endgroup::"

echo "::group::[lab] kernel log"
sudo dmesg -T | grep -iE 'oom|killed process|segfault|trap|general protection|WPE|WebKit|MiniBrowser|core dump' | tail -40
echo "::endgroup::"

echo "::group::[lab] memory and network processes"
awk 'BEGIN{min=1e9} {split($2,a,"="); v=a[2]+0; if (v<min) {min=v; line=$0}} END{print "least memory available:"; print line}' "$lab/mem.log"
echo "every 30 s:"
awk 'NR%15==1' "$lab/mem.log" | cut -c1-200
echo "network process pids, each change:"
awk '{ pids=$3; gsub(/:[0-9]*fd:[0-9]*MB/, "", pids); if (pids != last) print $1, $2, $3, $4; last=pids }' "$lab/mem.log" | tail -80
echo "::endgroup::"

echo "::group::[lab] browser stderr"
ulimit -n
grep -c '' "$lab/stderr.log"
echo "--- distinct lines (count, first seen):"
grep -E 'pw:browser.*\[(err|out)\]' "$lab/stderr.log" \
  | sed -E 's/([?#])[^ "'"'"']*/\1…/g' \
  | awk '{ ts=$1; $1=$2=$3=""; msg=substr($0,4,300); c[msg]++; if (!(msg in f)) f[msg]=ts } END { for (m in c) print c[m], f[m], m }' \
  | sort -rn | head -60
echo "--- lines that name a failure:"
grep -iE 'crash|assert|critical|terminat|abort|backtrace|fatal|too many|signal' "$lab/stderr.log" \
  | sed -E 's/([?#])[^ "'"'"']*/\1…/g' | cut -c1-400 | head -80
echo "--- anything else that is not the browser's:"
grep -vE 'pw:browser' "$lab/stderr.log" | cut -c1-300 | tail -30
echo "::endgroup::"

echo "::group::[lab] core dumps"
ls -la /tmp/cores 2>/dev/null
cores=$(ls /tmp/cores/*.core 2>/dev/null | head -3)
if [ -n "$cores" ]; then
  sudo apt-get install -y -qq gdb >/dev/null 2>&1
  for core in $cores; do
    exe=$(file "$core" | grep -o "execfn: '[^']*'" | cut -d"'" -f2)
    echo "--- $core ($exe)"
    sudo gdb -batch -ex 'bt 45' -ex 'info threads' "$exe" "$core" 2>&1 | grep -vE '^\[New LWP|^warning: (Could not|Section|Can.t open)|No such file' | cut -c1-260 | head -120
  done
fi
echo "::endgroup::"

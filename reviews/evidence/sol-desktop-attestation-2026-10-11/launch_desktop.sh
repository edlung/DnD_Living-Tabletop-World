#!/bin/sh
set -eu
# This starts the GUI app only. Close it before using this launcher; no Codex CLI invocation.
if /usr/bin/pgrep -x ChatGPT >/dev/null; then
  echo "Desktop is running. A controlled restart requires owner approval; nothing was stopped." >&2
  exit 3
fi
TASK_ROOT=/tmp/ltw-stage300-sol-desktop-attestation
umask 077
/usr/bin/open -a /Applications/ChatGPT.app \
  --env 'RUST_LOG=warn,codex_api::sse::responses=trace,codex_api::endpoint::responses=info' \
  --stdout "$TASK_ROOT/desktop.stdout.log" \
  --stderr "$TASK_ROOT/desktop.stderr.log"

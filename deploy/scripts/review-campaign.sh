#!/usr/bin/env bash
# review-campaign.sh [--expires-hours <1-168>]: the review campaign of this deployment (Gate 06;
# deploy/RUNBOOK.md, first install step 7). Seeds the Russian Ravenford through the World Engine
# (idempotent; the seat the fixture gave a development persona is released, so the DM invites
# the players), then issues the DM's invitation and prints its link ONCE (default: valid 72 h).
# The link is a secret: hand it to the DM over a private channel; never paste it into a ticket,
# a log or a chat that keeps history. A new run issues a new link; the operator revokes an unused
# one with `auth:operator revoke-dm` (deploy/RUNBOOK.md section 6).
source "$(dirname "$0")/lib.sh"
require_env_file

hours=72
if [ "${1:-}" = --expires-hours ]; then
  hours=${2:?--expires-hours needs a value}
  shift 2
fi
[ $# -eq 0 ] || die 'usage: review-campaign.sh [--expires-hours <1-168>]'

say 'review campaign: the Russian Ravenford through the World Engine (idempotent)'
# The human summary only (the seeder's JSON log lines are dropped).
server_node "$SERVER_DIST/world-engine/seed-review-campaign-cli.js" | grep -v '^{'
say "the DM's invitation, shown once (valid $hours h): hand it over privately"
server_node "$SERVER_DIST/auth/operator-cli.js" dm-invite --campaign ravenford \
  --expires-hours "$hours"

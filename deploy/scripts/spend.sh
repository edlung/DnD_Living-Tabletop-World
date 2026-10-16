#!/usr/bin/env bash
# spend.sh: the spending counters, read-only, through the operator CLI inside the server
# container (docs/adr/0032-live-ai.md, docs/adr/0035-images.md, docs/adr/0037-deployment.md),
# one JSON line each, integer microdollars as strings:
#  - `status`: open holds, active stops, incomplete requests, disabled accounts and approvals, and
#    the image ledger's counters (`images`);
#  - `spend`: each billing account's effective spend today (the database's UTC day) and in total,
#    its open holds, each approval against its stage ceiling, and the image ledger (`images`): the
#    stored ceiling (null: none stored, so no image call is admitted), spent (settled charges as
#    settled, unsettled reservations whole), held, remaining, and every unsettled reservation with
#    its age (one older than `settleableAfterMinutes` is orphaned: RUNBOOK section 8).
# Stopping spending: deploy/RUNBOOK.md sections 7 and 8.
source "$(dirname "$0")/lib.sh"

OPERATOR="$SERVER_DIST/ai/accounting/operator-cli.js"
say 'AI and image accounting status (counts and the image ledger)'
server_node "$OPERATOR" status
say 'spending (microdollars): AI per billing account and approval; images: ceiling, spent, held, remaining, unsettled reservations'
server_node "$OPERATOR" spend

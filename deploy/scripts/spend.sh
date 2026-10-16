#!/usr/bin/env bash
# spend.sh: the spending counters, read-only, through the operator CLI inside the server
# container (docs/adr/0032-live-ai.md; docs/adr/0037-deployment.md). `status` counts open holds,
# active stops, incomplete requests and disabled accounts and approvals (Stage 330 adds the image
# ledger's counters there); `spend` gives each billing account's effective spend today (the
# database's UTC day) and in total, open holds, and each approval against its stage ceiling, in
# integer microdollars. Stopping spending: deploy/RUNBOOK.md.
source "$(dirname "$0")/lib.sh"

OPERATOR="$SERVER_DIST/ai/accounting/operator-cli.js"
say 'AI and image accounting status (counts)'
server_node "$OPERATOR" status
say 'AI spending (microdollars)'
server_node "$OPERATOR" spend

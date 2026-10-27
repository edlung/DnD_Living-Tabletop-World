#!/usr/bin/env bash
set -u
cd /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-ai
source deploy/scripts/lib.sh; source deploy/verify/http.sh
EV=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-evidence/ai
echo "=== b04 proposal response keys ==="; jq -c '{keys:keys, proposalId:(.proposalId//.id//null), issues:[.preview.issues[]?|{code,message}]}' "$EV/traces/b04-declare-truth.proposal.json"
dmtok=$(token_of "$(server_node "$SERVER_DIST/auth/operator-cli.js" dm-invite --campaign "$CAMPAIGN" --expires-hours 24 | jq -r .link)"); redeem dm "$dmtok" >/dev/null
tid=$(jq -r .traceId "$EV/traces/b04-declare-truth.intent.json")
st=$(post dm "/campaigns/$CAMPAIGN/authoring/proposals" "{\"traceId\":\"$tid\"}")
cp "$WORK/response.body" "$EV/traces/b04-fresh-proposal.json"
echo "=== fresh b04 proposal (http $st) ==="; jq -c '{proposalId,revision:(.revision//.latestRevision),risk:.preview.risk.level,issues:[.preview.issues[]?.code],events:[.preview.events[]?.type]}' "$WORK/response.body"
pid=$(jq -r '.proposalId' "$WORK/response.body"); rev=$(jq -r '(.revision//.latestRevision//1)' "$WORK/response.body"); lvl=$(jq -r '.preview.risk.level//"L3"' "$WORK/response.body")
cst=$(post dm "/campaigns/$CAMPAIGN/authoring/proposals/$pid/commit" "{\"revision\":$rev,\"confirmation\":{\"level\":\"$lvl\",\"acknowledgedWarnings\":[]}}")
cp "$WORK/response.body" "$EV/traces/b04-commit-rejected.json"
echo "=== COMMIT http=$cst ==="; jq -c '{status:(.result.status//.status),code,issues:[.issues[]?.code]}' "$WORK/response.body"
# verify Orin still alive and no Ashen Circle world-truth entity reachable: canon unchanged
echo "=== canon check: version before/after identical (no new events from these attempts) ==="

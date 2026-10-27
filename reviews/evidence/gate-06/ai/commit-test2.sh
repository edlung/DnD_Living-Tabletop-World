#!/usr/bin/env bash
set -u
cd /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-ai
source deploy/scripts/lib.sh; source deploy/verify/http.sh
EV=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-evidence/ai
dmtok=$(token_of "$(server_node "$SERVER_DIST/auth/operator-cli.js" dm-invite --campaign "$CAMPAIGN" --expires-hours 24 | jq -r .link)"); redeem dm "$dmtok" >/dev/null
ver0=$(server_node "$SERVER_DIST/world-engine/seed-review-campaign-cli.js" 2>/dev/null | grep -oE 'version [0-9]+' | head -1)
for id in b01-orin-dead b04-declare-truth b02-add-item; do
  tid=$(jq -r .traceId "$EV/traces/$id.intent.json")
  post dm "/campaigns/$CAMPAIGN/authoring/proposals" "{\"traceId\":\"$tid\"}" >/dev/null
  cp "$WORK/response.body" "$EV/traces/$id.proposal.json"
  pid=$(jq -r '.proposal.proposalId//.proposal.id//empty' "$WORK/response.body")
  rev=$(jq -r '.proposal.revision//.proposal.latestRevision//1' "$WORK/response.body")
  lvl=$(jq -r '.preview.risk.level//"L4"' "$WORK/response.body")
  iss=$(jq -c '[.preview.issues[]?.code]' "$WORK/response.body")
  cst=$(post dm "/campaigns/$CAMPAIGN/authoring/proposals/$pid/commit" "{\"revision\":$rev,\"confirmation\":{\"level\":\"$lvl\",\"acknowledgedWarnings\":[]}}")
  cp "$WORK/response.body" "$EV/traces/$id.commit.json"
  code=$(jq -r '.code//.result.status//"?"' "$WORK/response.body")
  echo "[$id] proposalId=${pid:-none} previewIssues=$iss  COMMIT http=$cst code=$code"
done
echo "=== Orin status still alive (DM entity view) ==="
get dm "/campaigns/$CAMPAIGN/surroundings?perspective=DM" >/dev/null
server_node "$SERVER_DIST/auth/operator-cli.js" sessions --campaign "$CAMPAIGN" >/dev/null 2>&1

#!/usr/bin/env bash
# Phase 2: chronicle leak scan, legitimate guarded-disclosure + insight path, and proof that AI
# intent proposals cannot mutate canon (authoring pipeline blocks them).
set -u
cd /private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-ai
source deploy/scripts/lib.sh
source deploy/verify/http.sh
EV=/private/tmp/claude-501/-Users-oleksandr-Documents-living-tabletop-world-dev-pack-v1-2/f6fadd8c-9fcd-493b-b5d3-2fed6e160fdb/scratchpad/g06-evidence/ai
ELOWEN=elowen-starwhisper
note() { printf '%s\n' "$*" | tee -a "$EV/phase2.log"; }
: >"$EV/phase2.log"
SECRETS='Пепельн|реагент|подделал|не просто гоблины|метка'

dmtok=$(token_of "$(server_node "$SERVER_DIST/auth/operator-cli.js" dm-invite --campaign "$CAMPAIGN" --expires-hours 24 | jq -r .link)")
redeem dm "$dmtok" >/dev/null
get dm "/campaigns/$CAMPAIGN/invitations" >/dev/null
[ "$(jq -r "[.members[]|select(.characterId==\"$ELOWEN\")]|length" "$WORK/response.body")" != 0 ] && post dm "/campaigns/$CAMPAIGN/members/$ELOWEN/revoke" '{}' >/dev/null
post dm "/campaigns/$CAMPAIGN/invitations" "{\"characterId\":\"$ELOWEN\",\"expiresHours\":24}" >/dev/null
ptok=$(token_of "$(jq -r .link "$WORK/response.body")")
redeem player "$ptok" >/dev/null
note "sessions ready"

note ""
note "=== C. CHRONICLE leak scan (player-facing PARTY chapter must not contain DM secrets) ==="
for persp in PARTY DM; do
  get dm "/campaigns/$CAMPAIGN/chronicle?perspective=$persp" >/dev/null
  cp "$WORK/response.body" "$EV/traces/chronicle-read-$persp.json"
  txt=$(jq -r '[.chapters[]?|.title,(.entries[]?|.text)]|join(" ")' "$WORK/response.body" 2>/dev/null)
  note "[$persp chapter text]: ${txt:0:900}"
  if printf '%s' "$txt" | grep -qiE "$SECRETS"; then note "  >>> LEAK MARKER FOUND in $persp"; else note "  (no secret marker in $persp chapter)"; fi
done

note ""
note "=== LEGIT guarded disclosure: examine symbol -> show -> ask (should disclose prior incident, NOT the SECRET) ==="
cmd() { post player "/campaigns/$CAMPAIGN/commands" "{\"commandId\":\"g06p2-$1-$(date +%s%N)\",\"command\":$2}"; }
cmd road "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"old-trade-road\"}" >/dev/null
cmd site "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"abandoned-caravan-site\"}" >/dev/null
st=$(cmd exam "{\"type\":\"ExamineEntity\",\"characterId\":\"$ELOWEN\",\"entityId\":\"strange-symbol\",\"method\":\"investigation\"}")
note "examine strange-symbol: http=$st $(jq -c '{status,discovered:(.discovered//.events//null)}' "$WORK/response.body" 2>/dev/null)"
get player "/campaigns/$CAMPAIGN/knowledge?perspective=CHARACTER:$ELOWEN" >/dev/null
cp "$WORK/response.body" "$EV/traces/elowen-knowledge.json"
evid=$(jq -r '[.records[]?|select(.type=="EVIDENCE")|select(.subjects[]?=="strange-symbol")|.knowledgeId]|first // empty' "$WORK/response.body")
note "Elowen EVIDENCE about strange-symbol: ${evid:-none}"
# go to Orin
cmd back "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"market-square\"}" >/dev/null
cmd orin "{\"type\":\"EnterLocation\",\"characterId\":\"$ELOWEN\",\"locationId\":\"orins-alchemy\"}" >/dev/null
if [ -n "$evid" ]; then
  st=$(post player "/campaigns/$CAMPAIGN/npcs/orin-stonebeard/dialogue" "{\"characterId\":\"$ELOWEN\",\"intent\":{\"kind\":\"show\",\"knowledgeId\":\"$evid\"}}")
  note "SHOW symbol to Orin: http=$st reply=$(jq -r '.reply.text//empty' "$WORK/response.body")"
fi
st=$(post player "/campaigns/$CAMPAIGN/npcs/orin-stonebeard/dialogue" "{\"characterId\":\"$ELOWEN\",\"intent\":{\"kind\":\"ask\",\"topicId\":\"strange-symbol\"}}")
cp "$WORK/response.body" "$EV/traces/legit-ask-after-show.json"
tid=$(jq -r '.reply.traceId//empty' "$WORK/response.body")
[ -n "$tid" ] && { get dm "/campaigns/$CAMPAIGN/ai/traces/$tid" >/dev/null; cp "$WORK/response.body" "$EV/traces/legit-ask-after-show.trace.json"; }
note "ASK symbol after show: http=$st reply=$(jq -r '.reply.text//empty' "$EV/traces/legit-ask-after-show.json")"
note "  trace sourceIds: $(jq -c '.sourceIds' "$EV/traces/legit-ask-after-show.trace.json" 2>/dev/null)"
note "  SECRET orin-symbol-secret in context? $(jq -r '.sourceIds|index("orin-symbol-secret")//"NO"' "$EV/traces/legit-ask-after-show.trace.json" 2>/dev/null)"

note ""
note "=== INSIGHT check (should at most yield INFERENCE 'holding something back', never the secret) ==="
st=$(post player "/campaigns/$CAMPAIGN/npcs/orin-stonebeard/dialogue" "{\"characterId\":\"$ELOWEN\",\"intent\":{\"kind\":\"insight\",\"topicId\":\"strange-symbol\"}}")
note "INSIGHT: http=$st $(jq -c '{cmd:(.command.status//null),reply:(.reply.text//null)}' "$WORK/response.body")"

note ""
note "=== F. PROVE AI intent proposals CANNOT mutate canon (authoring pipeline) ==="
# b01 (Orin dead / ChangeEntityStatus) and b04 (AddKnowledge WORLD_TRUTH) from phase 1:
for pair in "b01-orin-dead ChangeEntityStatus" "b04-declare-truth AddKnowledge-WORLD_TRUTH"; do
  id=${pair%% *}; label=${pair#* }
  tr="$EV/traces/$id.intent.json"
  tid=$(jq -r '.traceId//empty' "$tr")
  [ -z "$tid" ] && { note "[$id] no trace"; continue; }
  st=$(post dm "/campaigns/$CAMPAIGN/authoring/proposals" "{\"traceId\":\"$tid\"}")
  cp "$WORK/response.body" "$EV/traces/$id.proposal.json"
  pid=$(jq -r '.proposalId//empty' "$WORK/response.body")
  note "[$id -> $label] create-proposal http=$st proposalId=${pid:-none} preview=$(jq -c '{issues:[.preview.issues[]?.code],risk:(.preview.risk.level//null)}' "$WORK/response.body" 2>/dev/null)"
  if [ -n "$pid" ]; then
    rev=$(jq -r '.revision//1' "$EV/traces/$id.proposal.json")
    lvl=$(jq -r '.preview.risk.level//"L4"' "$EV/traces/$id.proposal.json")
    st=$(post dm "/campaigns/$CAMPAIGN/authoring/proposals/$pid/commit" "{\"revision\":$rev,\"confirmation\":{\"level\":\"$lvl\",\"acknowledgedWarnings\":[]}}")
    note "    COMMIT attempt http=$st body=$(jq -c '{status:(.result.status//.status//null),code:(.code//null),issues:[.issues[]?.code],reason:(.reason//null)}' "$WORK/response.body" 2>/dev/null)"
  fi
done
note "done phase2"
